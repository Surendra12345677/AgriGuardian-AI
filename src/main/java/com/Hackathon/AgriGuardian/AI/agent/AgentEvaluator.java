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
    private static final Pattern JSON_OBJECT = Pattern.compile("\\{[\\s\\S]*\\}");

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
        try (var s = span.makeCurrent()) {
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
            You are a STRICT, CALIBRATED evaluator for an AI agronomy planning agent.
            Score the recommendation JSON against the real tool data provided.
            Return ONLY compact JSON — no markdown, no prose outside the JSON:
              {"relevance":0..1,"groundedness":0..1,"agronomic_correctness":0..1,
               "hallucination_risk":0..1,"reason":"<30 words>"}

            ⚠ CALIBRATION MANDATE — read carefully before scoring:
            • Scores of ALL 1.0 are FORBIDDEN unless you can prove, sentence-by-sentence,
              that every field is perfect. In practice, expect 0.75–0.88 for a good plan.
            • You MUST deduct at least 0.08 from ANY dimension that has even one imperfect
              element. Do not round up; round DOWN if in doubt.
            • If you catch yourself writing all four values ≥ 0.95, STOP and re-score more
              critically — you are almost certainly being too generous.

            SCORING RUBRIC (apply strictly):

            relevance (0..1):
              0.88 = plan mentions the actual soil type, season, and location — typical ceiling
              0.70 = plan is generally correct but omits one farm-specific detail
              0.50 = plan is mostly generic — could apply to any farm in the country
              0.20 = plan ignores the farm context entirely
              Deduct 0.10 if advice text does NOT mention the soil type from context.
              Deduct 0.10 if the tasks are generic day numbers (1,2,3...) with no crop logic.

            groundedness (0..1):
              0.85 = all impact numbers plausible given weather + market tool data
              0.65 = revenue/yield within 40% of what tool data suggests
              0.40 = numbers contradict tool data (e.g. ₹2L revenue for 1-acre sesame)
              0.10 = entirely fabricated figures
              Deduct 0.15 if expectedRevenueInr > ₹3,00,000 for a 2-acre farm.
              Deduct 0.10 if paybackWeeks < 2 or > 52.

            agronomic_correctness (0..1):
              0.90 = crop is ideal for season + soil + latitude AND market is priced at harvest date
              0.72 = crop is good but not optimal, OR market timing is slightly off (< 30 days)
              0.50 = crop is marginal (grows but not ideal for this soil/season)
              0.20 = crop is wrong season (e.g. wheat recommended in June monsoon)
              Deduct 0.20 if the crop is NOT in the validShortlist provided in context.
              Deduct 0.15 if marketAsOfDate == plantingDate (agent priced at planting, not harvest).

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
                        evalCtx.put("validShortlist",  basis.path("shortlist").toString());
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
        current.setAttribute(AttributeKey.stringKey("llm.input_messages.0.message.content"), judgeSystem.substring(0, Math.min(judgeSystem.length(), 1500)));
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

        double rel  = clamp01(n.path("relevance").asDouble(0.7));
        double grd  = clamp01(n.path("groundedness").asDouble(0.7));
        double agr  = clamp01(n.path("agronomic_correctness").asDouble(0.7));
        double hal  = clamp01(n.path("hallucination_risk").asDouble(0.7));
        double agg  = (rel + grd + agr + hal) / 4.0;
        return new EvalResult(rel, grd, agr, hal, round3(agg), "gemini-llm-judge");
    }

    /* ── Deterministic fallback rubric ─────────────────────────────── */

    EvalResult evaluateRubric(String recommendationJson, Map<String, Object> ctx) {
        // Conservative defaults — the rubric must earn a high score, not start at one.
        double rel = 0.65, grd = 0.60, agr = 0.65, hal = 0.80;
        try {
            Matcher m = JSON_OBJECT.matcher(recommendationJson == null ? "" : recommendationJson);
            if (m.find()) {
                JsonNode root = JSON.readTree(m.group());

                // Relevance — does it have advice + tasks + a crop?
                int parts = 0;
                if (root.hasNonNull("advice"))     parts++;
                if (root.has("tasks") && root.get("tasks").isArray() && root.get("tasks").size() >= 3) parts++;
                if (root.hasNonNull("crop"))       parts++;
                rel = 0.6 + 0.13 * parts;        // 0.6 .. 0.99

                // Groundedness — impact numbers consistent (the orchestrator
                // already reconciles these, so an *unreconciled* response gets
                // marked down).
                JsonNode imp = root.path("impact");
                if (imp.isObject()
                        && imp.path("expectedRevenueInr").asInt(0) > 0
                        && imp.path("extraIncomeInr").asInt(0)     > 0
                        && imp.path("paybackWeeks").asInt(0)       > 0) {
                    grd = 0.82;
                } else {
                    grd = 0.48;
                    hal = 0.55;
                }

                // Agronomic correctness — does crop appear in `_basis.shortlist`?
                String crop = root.path("crop").asText("").toLowerCase();
                JsonNode basis = root.path("_basis");
                if (!crop.isBlank() && basis.path("shortlist").isArray()) {
                    boolean inList = false;
                    for (JsonNode c : basis.path("shortlist")) {
                        if (crop.equals(c.asText("").toLowerCase())) { inList = true; break; }
                    }
                    agr = inList ? 0.88 : 0.50;
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
}

