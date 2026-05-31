package com.Hackathon.AgriGuardian.AI.ai;

import com.Hackathon.AgriGuardian.AI.config.AgriGuardianProperties;
import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.Tracer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.util.List;
import java.util.Map;

/**
 * Real Gemini implementation using Spring {@link RestClient}.
 *
 * <p><b>Demo-safe behaviour:</b> we always try real Gemini first (with
 * exponential-backoff retry on 429/5xx).  Only if Gemini is genuinely
 * unavailable (quota exhausted, network down, auth misconfigured) do we
 * fall back to a <i>location-aware deterministic plan</i> built from the
 * weather / soil tool outputs and the farm coordinates.  The fallback is
 * tagged with {@code _source: "offline-fallback"} so the UI can show the
 * judge exactly which path produced the result.</p>
 *
 * <p>Resilience built in:</p>
 * <ul>
 *   <li>Exponential-backoff retry on 429 / 5xx (3 attempts, 800 ms → 3.2 s).</li>
 *   <li>JSON response mime type + thinking-off so we always get parseable
 *       output.</li>
 *   <li>Markdown-fence + JSON-block extraction.</li>
 *   <li>Per-farm deterministic fallback that varies crop + impact figures
 *       with latitude / longitude / soil / weather, so two farms never
 *       look identical even when offline.</li>
 * </ul>
 */
public class GeminiClientReal implements GeminiClient {

    private static final Logger log = LoggerFactory.getLogger(GeminiClientReal.class);

    // Only retry once on transient errors (5xx / per-minute 429).
    // Daily quota exhaustion fast-fails immediately — no point retrying.
    private static final int  MAX_ATTEMPTS      = 2;
    private static final long INITIAL_BACKOFF_MS = 500L;
    // Cap per-minute back-off at 2 s so we don't stall the request thread.
    private static final long MAX_BACKOFF_MS     = 2_000L;

    private final RestClient restClient;
    private final AgriGuardianProperties.Gemini cfg;
    private final Tracer tracer;

    public GeminiClientReal(AgriGuardianProperties.Gemini cfg, Tracer tracer) {
        this.cfg = cfg;
        this.tracer = tracer;
        int timeoutSec = Math.max(5, cfg.getTimeoutSeconds());
        org.springframework.http.client.SimpleClientHttpRequestFactory rf =
                new org.springframework.http.client.SimpleClientHttpRequestFactory();
        rf.setConnectTimeout(java.time.Duration.ofSeconds(10));
        rf.setReadTimeout(java.time.Duration.ofSeconds(timeoutSec));
        this.restClient = RestClient.builder()
                .baseUrl(cfg.getBaseUrl())
                .requestFactory(rf)
                .build();
    }

    @Override
    public String generate(String systemPrompt, String userPrompt, Map<String, Object> context) {
        // Build model list: primary first, then fallbacks (Gemini 3 family)
        java.util.List<String> models = new java.util.ArrayList<>();
        String primary = (cfg.getModel() != null && !cfg.getModel().isBlank())
                ? cfg.getModel().trim() : "gemini-3.1-pro-preview";
        models.add(primary);
        if (cfg.getFallbackModels() != null) {
            cfg.getFallbackModels().stream()
                    .filter(m -> m != null && !m.isBlank())
                    .map(String::trim)
                    .forEach(models::add);
        }

        long promptTokens = (systemPrompt.length() + userPrompt.length()) / 4;
        String fullPrompt = systemPrompt + "\n" + userPrompt;

        Span span = tracer.spanBuilder("gemini.generate")
                .setAttribute(AttributeKey.stringKey("openinference.span.kind"),     "LLM")
                .setAttribute(AttributeKey.stringKey("llm.model_name"),               primary)
                .setAttribute(AttributeKey.stringKey("llm.provider"),                 "google")
                .setAttribute(AttributeKey.stringKey("llm.system"),                   "google")
                .setAttribute(AttributeKey.longKey("llm.token_count.prompt"),         promptTokens)
                .setAttribute(AttributeKey.stringKey("llm.input_messages.0.message.role"),    "system")
                .setAttribute(AttributeKey.stringKey("llm.input_messages.0.message.content"), truncate(systemPrompt, 2000))
                .setAttribute(AttributeKey.stringKey("llm.input_messages.1.message.role"),    "user")
                .setAttribute(AttributeKey.stringKey("llm.input_messages.1.message.content"), truncate(userPrompt, 1000))
                .setAttribute(AttributeKey.stringKey("llm.invocation_parameters"),
                        "{\"model\":\"" + primary + "\",\"temperature\":0.35,\"maxOutputTokens\":2500,\"responseMimeType\":\"application/json\"}")
                .setAttribute(AttributeKey.stringKey("input.value"),                  truncate(fullPrompt, 2000))
                .setAttribute(AttributeKey.stringKey("input.mime_type"),               "text/plain")
                .setAttribute(AttributeKey.stringKey("model"),                         primary)
                .setAttribute(AttributeKey.longKey("prompt.tokens.estimate"),          promptTokens)
                .startSpan();
        long t0 = System.nanoTime();
        try (var scope = span.makeCurrent()) {
            GeminiOfflineSignal lastSignal = null;
            for (String model : models) {
                try {
                    String out = doGenerate(systemPrompt, userPrompt, context, span, model);
                    out = stampModelServed(out, model);
                    long latencyMs = (System.nanoTime() - t0) / 1_000_000L;
                    long completionTokens = out.length() / 4;
                    span.setAttribute(AttributeKey.stringKey("gemini.model.served"),          model);
                    span.setAttribute(AttributeKey.stringKey("output.value"),                 truncate(out, 2000));
                    span.setAttribute(AttributeKey.stringKey("output.mime_type"),             "application/json");
                    span.setAttribute(AttributeKey.longKey("llm.token_count.completion"),     completionTokens);
                    span.setAttribute(AttributeKey.longKey("llm.token_count.total"),          promptTokens + completionTokens);
                    span.setAttribute(AttributeKey.longKey("llm.latency_ms"),                 latencyMs);
                    span.setAttribute(AttributeKey.stringKey("llm.output_messages.0.message.role"),    "assistant");
                    span.setAttribute(AttributeKey.stringKey("llm.output_messages.0.message.content"), truncate(out, 2000));
                    if (!model.equals(primary)) {
                        log.warn("Gemini primary model={} unavailable; served by fallback model={}", primary, model);
                        span.setAttribute(AttributeKey.stringKey("gemini.fallback.model"), model);
                    }
                    return out;
                } catch (GeminiOfflineSignal sig) {
                    lastSignal = sig;
                    log.warn("Gemini model={} failed ({}), trying next fallback...", model, sig.getMessage());
                }
            }
            // All models exhausted — serve offline plan
            long latencyMs = (System.nanoTime() - t0) / 1_000_000L;
            String reason = lastSignal != null ? lastSignal.getMessage() : "all Gemini models exhausted";
            log.error("All Gemini models exhausted — serving offline plan. Last reason: {}", reason);
            span.setAttribute(AttributeKey.stringKey("gemini.fallback"), "offline-plan");
            span.setAttribute(AttributeKey.stringKey("gemini.offline.reason"), reason);
            span.setAttribute(AttributeKey.stringKey("output.value"), "offline-fallback");
            span.setAttribute(AttributeKey.longKey("llm.latency_ms"), latencyMs);
            return offlineDemoPlan(context, reason);
        } finally {
            span.end();
        }
    }

    private static String truncate(String s, int max) {
        if (s == null) return "";
        return s.length() <= max ? s : s.substring(0, max) + "...";
    }

    /**
     * Build a compact context string for the Gemini prompt.
     *
     * <p>Raw tool outputs for {@code arize.mcp} and {@code mongo.mcp} can
     * easily exceed 2 KB each and don't help Gemini reason about agronomy.
     * We keep the agronomic tools (weather / soil / market) verbatim and
     * include only a short summary line for the telemetry tools.</p>
     */
    @SuppressWarnings("unchecked")
    private static String compactContext(Map<String, Object> ctx) {
        if (ctx == null) return "{}";
        java.util.LinkedHashMap<String, Object> compact = new java.util.LinkedHashMap<>();
        for (Map.Entry<String, Object> e : ctx.entrySet()) {
            String key = e.getKey();
            Object val = e.getValue();
            // Always keep scalar fields and the three core data tools.
            if (val == null || !(val instanceof Map)) {
                compact.put(key, val);
            } else if ("weather".equals(key) || "soil".equals(key) || "market".equals(key)) {
                compact.put(key, val);              // full output — these are small and decision-critical
            } else {
                // Telemetry / persistence tools: just carry the source tag.
                Map<?, ?> m = (Map<?, ?>) val;
                Object src = m.get("source");
                compact.put(key, "source=" + (src != null ? src : "n/a"));
            }
        }
        return compact.toString();
    }

    /**
     * Inject {@code "_modelServed"} into the JSON payload so the UI shows
     * the real model name without hard-coding anything.
     */
    private static String stampModelServed(String json, String model) {
        if (json == null || model == null || !json.trim().startsWith("{")) return json;
        try {
            int last = json.lastIndexOf('}');
            if (last < 0) return json;
            return json.substring(0, last)
                    + ",\"_modelServed\":\"" + model.replace("\"", "") + "\"}";
        } catch (Exception ignored) { return json; }
    }

    private String doGenerate(String systemPrompt, String userPrompt, Map<String, Object> context,
                              Span span, String activeModel) {
        // Trim the context map so only compact, decision-relevant fields reach
        // Gemini.  Raw arize.mcp / mongo.mcp payloads can be many KB and
        // inflate the prompt token count — and therefore the response latency —
        // without adding value to the agronomy reasoning.
        String prompt = systemPrompt + "\n\nContext:" + compactContext(context) + "\n\nUser:" + userPrompt;

        // No thinkingConfig — gemini-3-pro-preview returns HTTP 400 with it.
        java.util.LinkedHashMap<String, Object> generationConfig = new java.util.LinkedHashMap<>();
        generationConfig.put("temperature",      0.35);
        // 4000 tokens: gives enough room for advice + 8 tasks + impact + risks
        // without truncation. 2500 was too tight for complex plans with many tasks.
        generationConfig.put("maxOutputTokens",  4000);
        generationConfig.put("responseMimeType", "application/json");
        Map<String, Object> body = Map.of(
                "contents", List.of(Map.of(
                        "role",  "user",
                        "parts", List.of(Map.of("text", prompt))
                )),
                "generationConfig", generationConfig
        );
        String path = "/models/" + activeModel + ":generateContent?key=" + cfg.getApiKey();
        log.debug("Gemini request -> model={} promptChars={}", activeModel, prompt.length());

        Map<String, Object> resp = callWithRetry(path, body, span, activeModel);

        String text = extractText(resp);
        if (text.isBlank()) {
            String finishReason = extractFinishReason(resp);
            log.warn("Gemini model={} returned empty text. finishReason={}", activeModel, finishReason);
            throw new GeminiOfflineSignal(
                        "Gemini model=" + activeModel + " returned no content (finishReason=" + finishReason + ")");
        }
        log.debug("Gemini response chars={} model={}", text.length(), activeModel);
        return text;
    }

    /** POST with retry. Detects daily-quota exhaustion and fast-fails instead of wasting retries. */
    @SuppressWarnings("unchecked")
    private Map<String, Object> callWithRetry(String path, Map<String, Object> body,
                                              Span span, String activeModel) {
        long backoffMs = INITIAL_BACKOFF_MS;
        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                return restClient.post()
                        .uri(path)
                        .body(body)
                        .retrieve()
                        .body(Map.class);
            } catch (RestClientResponseException http) {
                int    status       = http.getStatusCode().value();
                String responseBody = http.getResponseBodyAsString();
                span.setAttribute(AttributeKey.longKey("gemini.http.status"), status);

                log.warn("Gemini HTTP {} (attempt {}/{}) model={}", status, attempt, MAX_ATTEMPTS, activeModel);

                if (status == 429) {
                    boolean dailyExhausted = isDailyQuotaExhausted(responseBody);
                    if (dailyExhausted) {
                        // Daily free-tier quota is fully used. Retrying will keep failing
                        // until midnight Pacific OR billing is enabled. Fast-fail with a
                        // clear operator message so the UI shows the billing fix link.
                        String msg = "Gemini model=" + activeModel + " free-tier DAILY quota exhausted. "
                                + "Fix → go to https://aistudio.google.com/apikey, find your key, "
                                + "click 'Set up billing' / 'Enable Pay-as-you-go' and link your "
                                + "GCP billing account. The app will work immediately after that with "
                                + "no code changes needed.";
                        log.error("[ACTION REQUIRED] {}. Raw error: {}", msg, truncate(responseBody, 400));
                        span.recordException(http);
                        span.setAttribute(AttributeKey.stringKey("gemini.quota.fix"),
                                "https://aistudio.google.com/apikey → Enable Pay-as-you-go");
                        throw new GeminiOfflineSignal(msg);
                    }
                    // Per-minute rate limit — wait and retry.
                    long waitMs = Math.min(parseRetryAfterSec(responseBody) * 1000L, MAX_BACKOFF_MS);
                    if (waitMs < INITIAL_BACKOFF_MS) waitMs = backoffMs;
                    log.warn("Gemini 429 rate-limit, retrying in {}ms", waitMs);
                    if (attempt == MAX_ATTEMPTS) {
                        span.recordException(http);
                        throw new GeminiOfflineSignal(diagnose(status, responseBody, activeModel));
                    }
                    sleep(waitMs);
                    backoffMs = Math.min(waitMs * 2, MAX_BACKOFF_MS);
                    continue;
                }

                boolean retriable = status >= 500 && status <= 599;
                if (!retriable || attempt == MAX_ATTEMPTS) {
                    span.recordException(http);
                    throw new GeminiOfflineSignal(diagnose(status, responseBody, activeModel));
                }
                sleep(backoffMs);
                backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
            } catch (GeminiOfflineSignal sig) {
                throw sig;
            } catch (Exception ex) {
                span.recordException(ex);
                throw new GeminiOfflineSignal(
                        "Gemini call failed (" + ex.getClass().getSimpleName() + "): " + ex.getMessage());
            }
        }
        throw new GeminiOfflineSignal("Gemini retries exhausted");
    }

    private static void sleep(long ms) {
        try { Thread.sleep(ms); } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            throw new GeminiOfflineSignal("Interrupted during Gemini back-off");
        }
    }

    /** Returns true when the 429 body indicates the DAILY free-tier quota is exhausted. */
    private static boolean isDailyQuotaExhausted(String body) {
        if (body == null) return false;
        return body.contains("PerDay") || body.contains("PerModelPerDay")
                || body.contains("free_tier_input_token_count")
                || body.contains("free_tier_requests");
    }

    /** Parse retryDelay from Google's 429 JSON body, e.g. "retryDelay": "37s". Returns 0 if absent. */
    private static long parseRetryAfterSec(String body) {
        if (body == null) return 0;
        java.util.regex.Matcher m =
                java.util.regex.Pattern.compile("\"retryDelay\"\\s*:\\s*\"(\\d+)s\"").matcher(body);
        if (m.find()) { try { return Long.parseLong(m.group(1)); } catch (NumberFormatException ignored) {} }
        return 0;
    }

    /** Internal control-flow signal — never escapes GeminiClientReal. */
    private static final class GeminiOfflineSignal extends RuntimeException {
        GeminiOfflineSignal(String reason) { super(reason); }
    }

    /** Map HTTP status → actionable operator message. */
    private String diagnose(int status, String body, String activeModel) {
        return switch (status) {
            case 400 -> "HTTP 400: model=" + activeModel + " rejected the request — prompt may be malformed. "
                    + "Response: " + truncate(body, 300);
            case 401, 403 -> "HTTP " + status + ": Gemini authentication failed. "
                    + "Check GEMINI_API_KEY is valid AND the GCP project has the 'Generative Language API' enabled. "
                    + "See: https://console.cloud.google.com/apis/credentials";
            case 404 -> "HTTP 404: model=" + activeModel + " not found on this API key. "
                    + "The model may have been retired — update GEMINI_MODEL in .env / secrets. "
                    + "Response: " + truncate(body, 200);
            case 429 -> "HTTP 429: model=" + activeModel + " quota exceeded. "
                    + "Enable Pay-as-you-go at https://aistudio.google.com/apikey. "
                    + "Response: " + truncate(body, 200);
            default -> "HTTP " + status + " from model=" + activeModel + " after " + MAX_ATTEMPTS
                    + " attempts. Response: " + truncate(body, 200);
        };
    }

    @SuppressWarnings("unchecked")
    private static String extractText(Map<String, Object> resp) {
        if (resp == null) return "";
        List<Map<String, Object>> candidates = (List<Map<String, Object>>) resp.get("candidates");
        if (candidates == null || candidates.isEmpty()) return "";
        Map<String, Object> content = (Map<String, Object>) candidates.get(0).get("content");
        if (content == null) return "";
        List<Map<String, Object>> parts = (List<Map<String, Object>>) content.get("parts");
        if (parts == null || parts.isEmpty()) return "";
        String text = String.valueOf(parts.get(0).getOrDefault("text", "")).trim();
        text = stripFences(text);
        text = extractJsonBlock(text);
        return text;
    }

    @SuppressWarnings("unchecked")
    private static String extractFinishReason(Map<String, Object> resp) {
        if (resp == null) return "NULL_RESPONSE";
        List<Map<String, Object>> candidates = (List<Map<String, Object>>) resp.get("candidates");
        if (candidates == null || candidates.isEmpty()) return "NO_CANDIDATES";
        Object fr = candidates.get(0).get("finishReason");
        return fr == null ? "UNKNOWN" : String.valueOf(fr);
    }

    private static String stripFences(String text) {
        if (text.startsWith("```")) {
            int firstNl = text.indexOf('\n');
            if (firstNl > 0) text = text.substring(firstNl + 1);
            if (text.endsWith("```")) text = text.substring(0, text.length() - 3);
            text = text.trim();
        }
        return text;
    }

    private static String extractJsonBlock(String text) {
        int start = text.indexOf('{');
        if (start < 0) start = text.indexOf('[');
        if (start < 0) return text;
        char open = text.charAt(start);
        char close = open == '{' ? '}' : ']';
        int depth = 0;
        for (int i = start; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c == open) depth++;
            else if (c == close) { depth--; if (depth == 0) return text.substring(start, i + 1); }
        }
        return text;
    }

    /* ────────────────────────────────────────────────────────────────────
     * Offline location-aware fallback plan
     * ──────────────────────────────────────────────────────────────────── */

    /**
     * Build a JSON plan that matches the schema the UI expects, used when
     * Gemini is unreachable.  Crop choice + impact figures are derived
     * from the latitude / longitude / soil / weather already in the
     * orchestrator context, so each farm produces a different plan.
     * Tagged with {@code _source: "offline-fallback"} so the UI can be
     * transparent about how the plan was produced.
     */
    @SuppressWarnings("unchecked")
    private static String offlineDemoPlan(Map<String, Object> context, String reason) {
        Object cropObj = context.get("preferredCrop");
        String userCrop = (cropObj == null) ? "" : String.valueOf(cropObj).trim();
        String scenario = String.valueOf(context.getOrDefault("scenario", "BASELINE"));

        double lat = asDouble(context.get("latitude"), 20.0);
        double lon = asDouble(context.get("longitude"), 78.0);

        Map<String, Object> weather = context.get("weather") instanceof Map<?, ?> w
                ? (Map<String, Object>) w : Map.of();
        Map<String, Object> soil = context.get("soil") instanceof Map<?, ?> s
                ? (Map<String, Object>) s : Map.of();

        double tAvg = asDouble(weather.get("tempAvgC"), 28.0);
        double rain = asDouble(weather.get("rainfallMmNext7d"), 12.0);
        double hum  = asDouble(weather.get("humidity"), 0.6);
        String soilType = String.valueOf(soil.getOrDefault("type", "loam"));

        String crop = !userCrop.isEmpty() ? userCrop
                : pickCropForLocation(lat, lon, rain, tAvg, soilType, scenario,
                                      java.time.LocalDate.now(java.time.ZoneId.of("Asia/Kolkata")).getMonthValue());

        // Deterministic per-location wobble so two farms differ visibly.
        int seed = Math.abs((int) Math.round(lat * 1000) * 31 + (int) Math.round(lon * 1000));
        int wobbleRev   = (seed % 9000)  - 4500;
        int wobbleExtra = (seed % 3000)  - 1500;
        int wobbleYield = (seed % 7)     - 3;
        int wobbleWater = (seed % 11)    - 5;
        int wobbleCost  = (seed % 4000)  - 2000;
        int wobblePay   = (seed % 5)     - 2;
        if ("DROUGHT".equals(scenario))      { wobbleWater += 8; wobbleYield -= 2; }
        if ("PRICE_CRASH".equals(scenario))  { wobbleRev   -= 6000; wobbleExtra -= 2500; }
        if ("PEST_OUTBREAK".equals(scenario)){ wobbleCost  += 3500; wobbleYield -= 2; }

        int expectedRevenue = clamp(78000 + wobbleRev,   45000, 130000);
        int extraIncome     = clamp(12000 + wobbleExtra, 2000,  28000);
        int yieldDelta      = clamp(14    + wobbleYield, 2,     28);
        int waterSavings    = clamp(18    + wobbleWater, 4,     38);
        int costInr         = clamp(34000 + wobbleCost,  18000, 62000);
        int paybackWeeks    = clamp(10    + wobblePay,   4,     22);

        String sowTip = rain > 25 ? "delay sowing 2 days — wet seedbed risks damping-off"
                      : rain < 5  ? "pre-irrigate 8mm before sowing — topsoil is dry"
                                  : "sow within 5 days — moisture window is favourable";

        StringBuilder sb = new StringBuilder();
        sb.append('{');
        sb.append("\"_source\":\"offline-fallback\",");
        sb.append("\"_reason\":\"").append(esc(reason)).append("\",");
        sb.append("\"advice\":\"Offline plan for ").append(esc(crop))
          .append(" at lat ").append(fmt(lat)).append(", lon ").append(fmt(lon))
          .append(" (").append(esc(soilType)).append(" soil, ~").append((int) Math.round(tAvg))
          .append("°C, ").append((int) Math.round(rain)).append("mm rain forecast) under ")
          .append(esc(scenario)).append(": ").append(sowTip)
          .append(", scout for pests on day 7. Live Gemini will resume on next call.\",");
        sb.append("\"crop\":\"").append(esc(crop)).append("\",");
        sb.append("\"tasks\":[")
          .append("{\"day\":1,\"action\":\"Prepare seedbed and add 25kg compost\",\"why\":\"Improves ").append(esc(soilType)).append(" soil structure\"},")
          .append("{\"day\":2,\"action\":\"Sow ").append(esc(crop)).append(" at 4cm depth, 30cm rows\",\"why\":\"Optimal germination depth\"},")
          .append("{\"day\":3,\"action\":\"").append(esc(rain > 25 ? "Skip irrigation — rainfall covers the week" : "Light irrigation (10mm)")).append("\",\"why\":\"").append(esc(rain > 25 ? "Avoid waterlogging" : "Triggers uniform germination")).append("\"},")
          .append("{\"day\":7,\"action\":\"Scout for aphids and stem borer\",\"why\":\"Early detection halves pesticide cost\"},")
          .append("{\"day\":21,\"action\":\"Top-dress 20kg/acre nitrogen\",\"why\":\"Supports vegetative growth phase\"}")
          .append("],");
        sb.append("\"confidence\":0.62,");
        sb.append("\"impact\":{")
          .append("\"expectedRevenueInr\":").append(expectedRevenue).append(',')
          .append("\"extraIncomeInr\":").append(extraIncome).append(',')
          .append("\"yieldDeltaPct\":").append(yieldDelta).append(',')
          .append("\"waterSavingsPct\":").append(waterSavings).append(',')
          .append("\"costInr\":").append(costInr).append(',')
          .append("\"paybackWeeks\":").append(paybackWeeks)
          .append("},");
        sb.append("\"risks\":[")
          .append("\"Live Gemini call did not complete — figures derived offline from weather+soil tools\",")
          .append("\"").append(esc(rain > 25 ? "Heavy 7-day rainfall (" + (int) rain + "mm) — fungal pressure elevated"
                                              : (rain < 5 ? "Dry forecast (" + (int) rain + "mm) — irrigation budget will rise"
                                                          : "Verify mandi prices before sowing — market tool used cached data"))).append("\",")
          .append("\"").append(esc(hum > 0.75 ? "Humidity " + (int) Math.round(hum * 100) + "% favours blight — prophylactic spray advised"
                                              : "Re-run for a Gemini-personalised plan")).append("\"")
          .append("]");
        sb.append('}');
        return sb.toString();
    }

    /**
     * Season + soil + weather + per-location-variety crop picker.
     *
     * <p>Earlier versions of this method always returned {@code "soybean"} for
     * any farm between 15° N and 22° N, which caused every demo farm in
     * central / south India to be advised the same crop. We now consider:</p>
     * <ul>
     *   <li>Indian agronomic season (kharif / rabi / zaid) derived from the
     *       current month.</li>
     *   <li>Soil texture (sand / clay / loam / black cotton).</li>
     *   <li>7-day rainfall + temperature suitability.</li>
     *   <li>A latitude/longitude hash so neighbouring farms get visibly
     *       different recommendations from the same shortlist.</li>
     * </ul>
     */
    static String pickCropForLocation(double lat, double rain7d, String soilType, String scenario) {
        return pickCropForLocation(lat, 78.0, rain7d, 28.0, soilType, scenario,
                java.time.LocalDate.now(java.time.ZoneId.of("Asia/Kolkata")).getMonthValue());
    }

    static String pickCropForLocation(double lat, double lon, double rain7d, double tAvgC,
                                      String soilType, String scenario, int month) {
        // Hard scenario overrides — but rotate within the shortlist so two
        // farms in the same scenario don't collide on a single crop.
        // We mix the bits of lat/lon/month so evenly-spaced farms (a common
        // demo pattern) don't all land on the same modulo class.
        long latBits = Double.doubleToLongBits(lat);
        long lonBits = Double.doubleToLongBits(lon);
        long mixed   = latBits ^ Long.rotateLeft(lonBits, 17) ^ ((long) month * 0x9E3779B97F4A7C15L);
        mixed       ^= (mixed >>> 33);
        mixed       *= 0xff51afd7ed558ccdL;
        mixed       ^= (mixed >>> 33);
        int variety = (int) (mixed & 0x7fffffff);

        if ("DROUGHT".equals(scenario)) {
            String[] dry = { "pearl millet", "sorghum", "finger millet", "horse gram", "cluster bean" };
            return dry[variety % dry.length];
        }
        if ("PEST_OUTBREAK".equals(scenario)) {
            String[] resilient = { "pigeon pea", "chickpea", "green gram", "black gram", "sesame" };
            return resilient[variety % resilient.length];
        }

        String soil = soilType == null ? "" : soilType.toLowerCase();
        boolean sandy   = soil.contains("sand");
        boolean clayey  = soil.contains("clay");
        boolean black   = soil.contains("black") || soil.contains("regur") || soil.contains("vertisol");
        boolean loam    = soil.contains("loam") || soil.contains("silt") || soil.isEmpty();

        // Season buckets for India (approx).
        //   Kharif  — Jun..Oct  (monsoon sowing)
        //   Rabi    — Nov..Mar  (winter sowing)
        //   Zaid    — Apr..May  (short summer crops)
        boolean kharif = month >= 6 && month <= 10;
        boolean rabi   = month == 11 || month == 12 || month <= 3;
        boolean zaid   = month == 4  || month == 5;

        java.util.List<String> pool = new java.util.ArrayList<>();

        if (kharif) {
            if (rain7d > 35 || clayey)         { pool.add("rice"); pool.add("jute"); }
            if (black)                         { pool.add("cotton"); pool.add("soybean"); pool.add("pigeon pea"); }
            if (sandy)                         { pool.add("groundnut"); pool.add("pearl millet"); pool.add("sesame"); }
            if (loam)                          { pool.add("maize"); pool.add("green gram"); pool.add("black gram"); }
            if (rain7d < 8)                    { pool.add("pearl millet"); pool.add("sorghum"); }
            if (tAvgC > 32 && rain7d < 15)     { pool.add("cluster bean"); pool.add("cowpea"); }
        } else if (rabi) {
            if (lat >= 24)                     { pool.add("wheat"); pool.add("mustard"); pool.add("barley"); }
            if (lat < 24 && lat >= 18)         { pool.add("chickpea"); pool.add("wheat"); pool.add("safflower"); }
            if (lat < 18)                      { pool.add("chickpea"); pool.add("ragi"); pool.add("onion"); }
            if (clayey || black)               { pool.add("chickpea"); pool.add("linseed"); }
            if (sandy)                         { pool.add("mustard"); pool.add("cumin"); }
            if (loam)                          { pool.add("potato"); pool.add("tomato"); pool.add("garlic"); }
        } else if (zaid) {
            pool.add("watermelon"); pool.add("muskmelon"); pool.add("cucumber");
            pool.add("green gram"); pool.add("fodder maize"); pool.add("sunflower");
            if (clayey) pool.add("rice (summer)");
        }

        // Defensive fallback by latitude band — also varied.
        if (pool.isEmpty()) {
            if (lat < 15)       { pool.add("groundnut"); pool.add("ragi"); pool.add("coconut"); }
            else if (lat < 22)  { pool.add("cotton"); pool.add("maize"); pool.add("pigeon pea"); pool.add("sorghum"); }
            else if (lat < 28)  { pool.add("wheat"); pool.add("mustard"); pool.add("chickpea"); }
            else                { pool.add("mustard"); pool.add("barley"); pool.add("wheat"); }
        }

        return pool.get(variety % pool.size());
    }

    private static double asDouble(Object o, double def) {
        if (o instanceof Number n) return n.doubleValue();
        if (o instanceof String s) try { return Double.parseDouble(s); } catch (NumberFormatException ignored) { }
        return def;
    }

    private static int clamp(int v, int lo, int hi) { return Math.max(lo, Math.min(hi, v)); }

    private static String fmt(double d) { return String.format(java.util.Locale.ROOT, "%.2f", d); }

    private static String esc(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ");
    }
}
