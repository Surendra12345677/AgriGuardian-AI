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
 * Real Gemini implementation using Spring {@link RestClient}. Kept intentionally
 * small — production hardening (retries, structured output, function calling) is
 * future work tracked in the roadmap.
 */
public class GeminiClientReal implements GeminiClient {

    private static final Logger log = LoggerFactory.getLogger(GeminiClientReal.class);

    private final RestClient restClient;
    private final AgriGuardianProperties.Gemini cfg;
    private final Tracer tracer;

    public GeminiClientReal(AgriGuardianProperties.Gemini cfg, Tracer tracer) {
        this.cfg = cfg;
        this.tracer = tracer;
        this.restClient = RestClient.builder().baseUrl(cfg.getBaseUrl()).build();
    }

    @Override
    public String generate(String systemPrompt, String userPrompt, Map<String, Object> context) {
        Span span = tracer.spanBuilder("gemini.generate")
                .setAttribute(AttributeKey.stringKey("model"), cfg.getModel())
                .setAttribute(AttributeKey.longKey("prompt.tokens.estimate"),
                        (long) ((systemPrompt.length() + userPrompt.length()) / 4))
                .startSpan();
        try (var scope = span.makeCurrent()) {
            String prompt = systemPrompt + "\n\nContext:" + context + "\n\nUser:" + userPrompt;

            // Gemini 2.5 enables "thinking" by default and will happily burn the
            // entire output budget on internal reasoning tokens, returning
            // finishReason=MAX_TOKENS with NO parts. We:
            //   * cap thinking (thinkingBudget=0 on flash, low cap on pro),
            //   * raise maxOutputTokens,
            //   * force JSON mime type so we get a parseable response.
            String model = cfg.getModel() == null ? "" : cfg.getModel().toLowerCase();
            boolean isFlash = model.contains("flash");
            Map<String, Object> thinkingConfig = isFlash
                    ? Map.of("thinkingBudget", 0)        // flash: thinking off
                    : Map.of("thinkingBudget", 512);     // pro: tight cap
            Map<String, Object> generationConfig = Map.of(
                    "temperature",       0.4,
                    "topP",              0.9,
                    "maxOutputTokens",   4096,
                    "responseMimeType",  "application/json",
                    "thinkingConfig",    thinkingConfig
            );
            Map<String, Object> body = Map.of(
                    "contents", List.of(Map.of(
                            "role", "user",
                            "parts", List.of(Map.of("text", prompt))
                    )),
                    "generationConfig", generationConfig
            );
            String path = "/models/" + cfg.getModel() + ":generateContent?key=" + cfg.getApiKey();
            log.debug("Gemini request -> model={} baseUrl={} promptChars={}",
                    cfg.getModel(), cfg.getBaseUrl(), prompt.length());

            @SuppressWarnings("unchecked")
            Map<String, Object> resp = restClient.post()
                    .uri(path)
                    .body(body)
                    .retrieve()
                    .body(Map.class);

            String text = extractText(resp);
            if (text == null || text.isBlank()) {
                String finishReason = extractFinishReason(resp);
                Object usage = resp == null ? null : resp.get("usageMetadata");
                log.warn("Gemini returned empty text. finishReason={} usageMetadata={} keys={}",
                        finishReason, usage,
                        resp == null ? "null" : resp.keySet());
                // Return a structured JSON so the UI can explain *why* instead
                // of silently rendering nothing.
                return "{\"advice\":\"Gemini returned no content (finishReason=" + finishReason
                        + "). This usually means thinking tokens consumed the output budget; "
                        + "thinkingConfig is now disabled — please retry.\","
                        + "\"tasks\":[],\"confidence\":0.0}";
            } else {
                log.debug("Gemini response chars={}", text.length());
            }
            return text;
        } catch (RestClientResponseException http) {
            // Log the full response body so model-not-found / quota / auth errors are visible.
            String body = http.getResponseBodyAsString();
            log.warn("Gemini HTTP {} for model={} : {}",
                    http.getStatusCode(), cfg.getModel(),
                    body.length() > 800 ? body.substring(0, 800) + "...[truncated]" : body);
            span.recordException(http);
            return "{\"advice\":\"Gemini call failed — please retry.\",\"tasks\":[],\"confidence\":0.0}";
        } catch (Exception ex) {
            span.recordException(ex);
            log.warn("Gemini call failed, returning empty advice: {}", ex.toString());
            return "{\"advice\":\"Gemini call failed — please retry.\",\"tasks\":[],\"confidence\":0.0}";
        } finally {
            span.end();
        }
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
        // Gemini often wraps JSON in ```json ... ``` fences, or adds chatty
        // preamble/trailer around the JSON object.  Strip aggressively so
        // downstream JSON.parse always succeeds.
        text = stripFences(text);
        // If the text still isn't a clean JSON object, try to extract the
        // first { … } or [ … ] block (greedy).
        text = extractJsonBlock(text);
        return text;
    }

    /** Pull the candidate finishReason for diagnostic logging. */
    @SuppressWarnings("unchecked")
    private static String extractFinishReason(Map<String, Object> resp) {
        if (resp == null) return "NULL_RESPONSE";
        List<Map<String, Object>> candidates = (List<Map<String, Object>>) resp.get("candidates");
        if (candidates == null || candidates.isEmpty()) return "NO_CANDIDATES";
        Object fr = candidates.get(0).get("finishReason");
        return fr == null ? "UNKNOWN" : String.valueOf(fr);
    }

    /** Strip all markdown code fences (```json … ``` or ``` … ```). */
    private static String stripFences(String text) {
        if (text.startsWith("```")) {
            int firstNl = text.indexOf('\n');
            if (firstNl > 0) text = text.substring(firstNl + 1);
            if (text.endsWith("```")) text = text.substring(0, text.length() - 3);
            text = text.trim();
        }
        return text;
    }

    /**
     * If the string has chatty text before/after the JSON body, extract
     * just the outermost { … } or [ … ].  Falls back to the original text.
     */
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
        return text; // unbalanced — return as-is
    }
}

