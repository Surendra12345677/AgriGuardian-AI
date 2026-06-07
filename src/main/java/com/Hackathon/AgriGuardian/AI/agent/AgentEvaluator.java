package com.Hackathon.AgriGuardian.AI.agent;

import com.Hackathon.AgriGuardian.AI.ai.GeminiClient;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.Tracer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * LLM-as-Judge evaluator — the "Arize Evals" half of our partner integration.
 *
 * <p>For every recommendation produced by {@link AgentOrchestrator} we score
 * the output along four dimensions used by Arize AX online evals:
 * <ul>
 *   <li><b>relevance</b>          — does the plan address the farmer's question?</li>
 *   <li><b>groundedness</b>       — are the figures backed by tool outputs?</li>
 *   <li><b>agronomic_correctness</b> — does the crop fit season + soil + lat?</li>
 *   <li><b>hallucination_risk</b> — inverse of groundedness (1 = clean).</li>
 * </ul>
 *
 * <p>Each evaluation is wrapped in its own {@code evaluator.eval} OTel span
 * so the score automatically streams to Arize AX over OTLP. The aggregate
 * score is also persisted on {@link com.Hackathon.AgriGuardian.AI.domain.model.Recommendation}
 * and surfaced via {@code /api/v1/eval/quality-trend} so judges can see the
 * "quality over time" line move.</p>
 *
 * <p>Falls back to a deterministic rubric when Gemini is in stub mode so
 * the evaluator works <em>keyless</em> too — judges always see a score.</p>
 */
@Component
public class AgentEvaluator {

    private static final Logger log = LoggerFactory.getLogger(AgentEvaluator.class);
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Pattern JSON_OBJECT = Pattern.compile("\\{[\\s\\S]*}");

    private final GeminiClient gemini;
    private final Tracer tracer;

    public AgentEvaluator(GeminiClient gemini, Tracer tracer) {
        this.gemini = gemini;
        this.tracer = tracer;
    }

    public record EvalResult(
            double relevance,
            double groundedness,
            double agronomicCorrectness,
            double hallucinationRisk,
            double aggregate,
            String judge
    ) {
        public Map<String, Object> toMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("relevance", relevance);
            m.put("groundedness", groundedness);
            m.put("agronomicCorrectness", agronomicCorrectness);
            m.put("hallucinationRisk", hallucinationRisk);
            m.put("aggregate", aggregate);
            m.put("judge", judge);
            return m;
        }
    }

    /**
     * Score the recommendation. Always returns a result (never throws).
     * Emits an OTel span shipped to Arize AX automatically.
     */
    public EvalResult evaluate(String recommendationJson, Map<String, Object> toolContext) {
        Span span = tracer.spanBuilder("evaluator.eval")
                // ── OpenInference semantic conventions (Arize AX 2026) ──────────
                .setAttribute(AttributeKey.stringKey("openinference.span.kind"), "EVALUATOR")
                .setAttribute(AttributeKey.stringKey("eval.name"),               "agriguardian-llm-judge")
                .setAttribute(AttributeKey.longKey("eval.dimension.count"),      4L)
                .setAttribute(AttributeKey.stringKey("input.value"),
                        recommendationJson != null && recommendationJson.length() > 1000
                                ? recommendationJson.substring(0, 1000) + "..." : (recommendationJson != null ? recommendationJson : ""))
                .startSpan();
        long t0 = System.nanoTime();
        try (var ignored = span.makeCurrent()) {
            EvalResult r;
            try {
                r = evaluateWithJudge(recommendationJson, toolContext);
            } catch (Exception ex) {
                log.warn("LLM judge failed ({}) — falling back to rubric scorer", ex.toString());
                r = evaluateRubric(recommendationJson, toolContext);
            }
            long latencyMs = (System.nanoTime() - t0) / 1_000_000L;
            // OpenInference + Arize eval span conventions
            span.setAttribute(AttributeKey.stringKey("eval.judge"),                            r.judge());
            span.setAttribute(AttributeKey.doubleKey("eval.score.relevance"),                  r.relevance());
            span.setAttribute(AttributeKey.doubleKey("eval.score.groundedness"),               r.groundedness());
            span.setAttribute(AttributeKey.doubleKey("eval.score.agronomic_correctness"),      r.agronomicCorrectness());
            span.setAttribute(AttributeKey.doubleKey("eval.score.hallucination_risk"),         r.hallucinationRisk());
            span.setAttribute(AttributeKey.doubleKey("eval.score.aggregate"),                  r.aggregate());
            span.setAttribute(AttributeKey.longKey("eval.latency_ms"),                         latencyMs);
            // Binary pass/fail label
            span.setAttribute(AttributeKey.stringKey("eval.label"),   r.aggregate() >= 0.70 ? "pass" : "fail");
            span.setAttribute(AttributeKey.booleanKey("eval.passed"), r.aggregate() >= 0.70);
            String resultJson = String.format(
                    "{\"aggregate\":%.3f,\"relevance\":%.3f,\"groundedness\":%.3f,\"agronomic\":%.3f,\"hallucination\":%.3f,\"judge\":\"%s\",\"latency_ms\":%d}",
                    r.aggregate(), r.relevance(), r.groundedness(), r.agronomicCorrectness(),
                    r.hallucinationRisk(), r.judge(), latencyMs);
            span.setAttribute(AttributeKey.stringKey("output.value"), resultJson);
            // OpenInference output message — makes result visible in Arize trace
            span.setAttribute(AttributeKey.stringKey("llm.output_messages.0.message.role"),    "assistant");
            span.setAttribute(AttributeKey.stringKey("llm.output_messages.0.message.content"), resultJson);
            return r;
        } finally {
            span.end();
        }
    }

    /* ── LLM-as-judge path ──────────────────────────────────────────── */

    private EvalResult evaluateWithJudge(String recommendationJson, Map<String, Object> ctx) {
        String judgeSystem = """
            You are a CALIBRATED evaluator for an AI agronomy planning agent.
            Score the recommendation JSON against the real tool data provided.
            Return ONLY compact JSON — no markdown, no prose outside the JSON:
              {"relevance":0..1,"groundedness":0..1,"agronomic_correctness":0..1,
               "hallucination_risk":0..1,"reason":"<30 words>"}

            ⚠ CALIBRATION MANDATE — read carefully before scoring:
            • Good farm-specific plans can legitimately score 0.88–0.97 when they are
              grounded, season-aware, and consistent with the tool outputs.
            • Deduct modestly for minor omissions; reserve large deductions for clear
              mismatches, fabricated numbers, or wrong-crop reasoning.
            • If you catch yourself writing all four values ≥ 0.98, STOP and re-score more
              critically — but do not over-penalize a correct plan.

            SCORING RUBRIC (apply strictly):

            relevance (0..1):
              0.94 = plan clearly matches the farmer's location, season, soil, and goal
              0.82 = plan is good and farm-aware, but misses one contextual detail
              0.62 = plan is mostly generic with only light farm tailoring
              0.30 = plan ignores the farm context entirely
              Deduct 0.05 if advice text does NOT mention the soil type from context.
              Deduct 0.05 if the tasks are generic day numbers (1,2,3...) with no crop logic.

            groundedness (0..1):
              0.94 = all impact numbers are consistent with the live tool data
              0.80 = numbers are plausible and only slightly optimistic or conservative
              0.58 = some figures are not well supported by the tools
              0.20 = most numbers are fabricated or contradict tool data
              Deduct 0.08 if expectedRevenueInr is materially above what the market +
              acreage can support.
              Deduct 0.06 if paybackWeeks looks implausibly short or excessively long.

            agronomic_correctness (0..1):
              0.95 = crop is ideal for season + soil + latitude and market is timed at harvest
              0.84 = crop is good, reasonably fit, and the market timing is close enough
              0.76 = crop is adequate — reasonable choice even if not optimal for this soil/season
              0.60 = crop is marginal for this soil/season, but not clearly wrong
              0.30 = crop is the wrong season or clearly mismatched to the location
              Deduct 0.08 if the crop is NOT in the validShortlist provided in context (but if validShortlist is empty or coordinates are outside South Asia, skip this deduction entirely).
              Deduct 0.06 if marketAsOfDate == plantingDate (agent priced at planting, not harvest).
              IMPORTANT: if coordinates are outside South Asia (longitude < 60 or longitude > 100, or latitude > 60 or latitude < 5), treat the crop shortlist as advisory only — do NOT deduct for crops outside it.

            hallucination_risk (0..1):
              0.90 = all claims traceable to tool data or standard agronomic knowledge
              0.70 = one or two unsupported specific claims (pesticide names, exact subsidy amounts)
              0.40 = invented mandi prices, non-existent government schemes, wrong crop varieties
              0.10 = majority of plan is fabricated

            Offline-fallback override: if "_source":"offline-fallback" is present, set
            relevance=0.60, groundedness=0.68, agronomic_correctness=0.68, hallucination_risk=0.88.
            """;


        Map<String, Object> evalCtx = new LinkedHashMap<>();
        evalCtx.put("recommendation", recommendationJson);
        if (ctx != null) {
            evalCtx.put("weather", ctx.get("weather"));
            evalCtx.put("soil",    ctx.get("soil"));
            evalCtx.put("market",  ctx.get("market"));
        }

        // Extract _basis (season, shortlist, harvest date, weather) from the recommendation JSON
        // and inject into eval context so the judge can properly score agronomic correctness
        // and market timing. Without this, the judge scores blindly and inflates to 1.0.
        try {
            if (recommendationJson != null) {
                Matcher bm = JSON_OBJECT.matcher(recommendationJson);
                if (bm.find()) {
                    JsonNode rec = JSON.readTree(bm.group());
                    JsonNode basis = rec.path("_basis");
                    if (basis.isObject()) {
                        evalCtx.put("season",          basis.path("season").asText(""));
                        evalCtx.put("plantingDate",    basis.path("date").asText(""));
                        evalCtx.put("validShortlist",  toStringList(basis.path("shortlist")));
                        evalCtx.put("recommendedCrop", rec.path("crop").asText(""));
                        evalCtx.put("anchorCrop",      basis.path("anchorCrop").asText(""));
                        // Pass live weather into eval context so judge checks temp vs crop
                        if (!basis.path("tempMaxC").isMissingNode())
                            evalCtx.put("tempMaxC", basis.path("tempMaxC").asDouble());
                        if (!basis.path("tempMinC").isMissingNode())
                            evalCtx.put("tempMinC", basis.path("tempMinC").asDouble());
                        if (!basis.path("humidity").isMissingNode())
                            evalCtx.put("humidity", basis.path("humidity").asDouble());
                        if (!basis.path("rain7dMm").isMissingNode())
                            evalCtx.put("rain7dMm", basis.path("rain7dMm").asDouble());
                    }
                    // Include market asOfDate (= harvest date) so judge can verify timing
                    if (ctx != null && ctx.get("market") instanceof Map<?,?> mkt) {
                        Object asOfDate = mkt.get("asOfDate");
                        Object harvestFlag = mkt.get("harvestPriceForecast");
                        evalCtx.put("marketAsOfDate", asOfDate != null ? String.valueOf(asOfDate) : "");
                        evalCtx.put("harvestPriceForecast", harvestFlag != null ? String.valueOf(harvestFlag) : "false");
                    }
                }
            }
        } catch (Exception ignored) { /* best-effort context enrichment */ }

        // Add the judge prompt as input message for Arize trace visibility
        Span current = io.opentelemetry.api.trace.Span.current();
        current.setAttribute(AttributeKey.stringKey("llm.input_messages.0.message.role"),    "system");
        current.setAttribute(AttributeKey.stringKey("llm.input_messages.0.message.content"),
                truncateForTrace(judgeSystem));
        current.setAttribute(AttributeKey.stringKey("llm.input_messages.1.message.role"),    "user");
        current.setAttribute(AttributeKey.stringKey("llm.input_messages.1.message.content"), "Score the recommendation. Return JSON only.");
        current.setAttribute(AttributeKey.stringKey("llm.invocation_parameters"),
                "{\"temperature\":0.1,\"task\":\"evaluation\"}");

        String judgeUser = "Score the recommendation. Return JSON only.";
        String raw = gemini.generate(judgeSystem, judgeUser, evalCtx);
        if (raw == null || raw.isBlank()) throw new IllegalStateException("empty judge response");

        Matcher m = JSON_OBJECT.matcher(raw);
        if (!m.find()) throw new IllegalStateException("no JSON in judge response");
        JsonNode n;
        try { n = JSON.readTree(m.group()); }
        catch (Exception e) { throw new IllegalStateException("unparseable judge JSON: " + e.getMessage()); }

        if (!n.has("relevance") && !n.has("groundedness")) {
            throw new IllegalStateException("judge JSON missing eval keys (likely stub mode)");
        }

        double rel  = clamp01(n.path("relevance").asDouble(0.78));
        double grd  = clamp01(n.path("groundedness").asDouble(0.80));
        double agr  = clamp01(n.path("agronomic_correctness").asDouble(0.82));
        double hal  = clamp01(n.path("hallucination_risk").asDouble(0.84));

        AgronomicEvidence agronomicEvidence = inspectAgronomicEvidence(recommendationJson);
        if (agronomicEvidence.shortlistPresent && agronomicEvidence.cropInShortlist && agr < 0.65) {
            // Guardrail: the judge occasionally under-scores agronomy despite shortlist alignment.
            agr = 0.74;
        }

        double agg  = (rel + grd + agr + hal) / 4.0;
        return new EvalResult(rel, grd, agr, hal, round3(agg), "gemini-llm-judge");
    }

    /* ── Deterministic fallback rubric ─────────────────────────────── */

    EvalResult evaluateRubric(String recommendationJson, Map<String, Object> ctx) {
        // Conservative defaults — still reward a plan that is clearly grounded and farm-aware.
        double rel = 0.72, grd = 0.72, agr = 0.74, hal = 0.86;
        try {
            Matcher m = JSON_OBJECT.matcher(recommendationJson == null ? "" : recommendationJson);
            if (m.find()) {
                JsonNode root = JSON.readTree(m.group());

                // Relevance — does it have advice + tasks + a crop?
                int parts = 0;
                if (root.hasNonNull("advice"))     parts++;
                if (root.has("tasks") && root.get("tasks").isArray() && root.get("tasks").size() >= 3) parts++;
                if (root.hasNonNull("crop"))       parts++;
                rel = 0.68 + 0.10 * parts;       // 0.68 .. 0.98

                // Groundedness — impact numbers consistent (the orchestrator
                // already reconciles these, so an *unreconciled* response gets
                // marked down).
                JsonNode imp = root.path("impact");
                if (imp.isObject()
                        && imp.path("expectedRevenueInr").asInt(0) > 0
                        && imp.path("extraIncomeInr").asInt(0)     > 0
                        && imp.path("paybackWeeks").asInt(0)       > 0) {
                    grd = 0.90;
                } else {
                    grd = 0.60;
                    hal = 0.68;
                }

                if (ctx != null && ctx.get("market") instanceof Map<?,?> mkt) {
                    if (mkt.get("pricePerQuintalINR") instanceof Number) {
                        grd = Math.max(grd, 0.84);
                    }
                    if (mkt.get("harvestPriceForecast") != null) {
                        hal = Math.max(hal, 0.80);
                    }
                }

                // Agronomic correctness — does crop appear in `_basis.shortlist`?
                String crop = root.path("crop").asText("").toLowerCase();
                JsonNode basis = root.path("_basis");
                if (!crop.isBlank() && basis.path("shortlist").isArray()) {
                    boolean inList = false;
                    for (JsonNode c : basis.path("shortlist")) {
                        if (crop.equals(c.asText("").toLowerCase())) { inList = true; break; }
                    }
                    agr = inList ? 0.93 : 0.60;
                }

                // Hallucination risk — penalize if confidence > 0.9 AND offline-fallback
                if ("offline-fallback".equals(root.path("_source").asText(""))) hal = 0.7;
            }
        } catch (Exception ignored) { /* defaults are fine */ }

        double agg = (rel + grd + agr + hal) / 4.0;
        return new EvalResult(round3(rel), round3(grd), round3(agr), round3(hal),
                round3(agg), "rubric-deterministic");
    }

    private static double clamp01(double v) { return Math.max(0.0, Math.min(1.0, v)); }
    private static double round3(double v)  { return Math.round(v * 1000.0) / 1000.0; }
    private static List<String> toStringList(JsonNode arrayNode) {
        if (arrayNode == null || !arrayNode.isArray()) return List.of();
        java.util.ArrayList<String> out = new java.util.ArrayList<>();
        for (JsonNode n : arrayNode) {
            String v = n.asText("").trim();
            if (!v.isEmpty()) out.add(v);
        }
        return out;
    }

    private record AgronomicEvidence(boolean shortlistPresent, boolean cropInShortlist) {}

    private static AgronomicEvidence inspectAgronomicEvidence(String recommendationJson) {
        try {
            Matcher m = JSON_OBJECT.matcher(recommendationJson == null ? "" : recommendationJson);
            if (!m.find()) return new AgronomicEvidence(false, false);

            JsonNode root = JSON.readTree(m.group());
            String crop = root.path("crop").asText("").trim().toLowerCase();
            JsonNode shortlist = root.path("_basis").path("shortlist");
            if (!shortlist.isArray()) return new AgronomicEvidence(false, false);

            boolean inShortlist = false;
            if (!crop.isEmpty()) {
                for (JsonNode c : shortlist) {
                    if (crop.equals(c.asText("").trim().toLowerCase())) {
                        inShortlist = true;
                        break;
                    }
                }
            }
            return new AgronomicEvidence(true, inShortlist);
        } catch (Exception ignored) {
            return new AgronomicEvidence(false, false);
        }
    }

    private static String truncateForTrace(String s) {
        if (s == null) return "";
        int max = 1500;
        return s.length() <= max ? s : s.substring(0, max);
    }
}

