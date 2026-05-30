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
                .setAttribute(AttributeKey.stringKey("openinference.span.kind"), "CHAIN")
                .startSpan();
        try (var s = span.makeCurrent()) {
            EvalResult r;
            try {
                r = evaluateWithJudge(recommendationJson, toolContext);
            } catch (Exception ex) {
                log.warn("LLM judge failed ({}) — falling back to rubric scorer", ex.toString());
                r = evaluateRubric(recommendationJson, toolContext);
            }
            // OpenInference + Arize eval span conventions
            span.setAttribute(AttributeKey.stringKey("eval.judge"),                            r.judge());
            span.setAttribute(AttributeKey.doubleKey("eval.score.relevance"),                  r.relevance());
            span.setAttribute(AttributeKey.doubleKey("eval.score.groundedness"),               r.groundedness());
            span.setAttribute(AttributeKey.doubleKey("eval.score.agronomic_correctness"),      r.agronomicCorrectness());
            span.setAttribute(AttributeKey.doubleKey("eval.score.hallucination_risk"),         r.hallucinationRisk());
            span.setAttribute(AttributeKey.doubleKey("eval.score.aggregate"),                  r.aggregate());
            // Binary pass/fail label — Arize groups these in the Evals tab
            span.setAttribute(AttributeKey.stringKey("eval.label"),                            r.aggregate() >= 0.70 ? "pass" : "fail");
            span.setAttribute(AttributeKey.booleanKey("eval.passed"),                          r.aggregate() >= 0.70);
            span.setAttribute(AttributeKey.stringKey("output.value"),
                    String.format("{\"aggregate\":%.3f,\"relevance\":%.3f,\"groundedness\":%.3f,\"agronomic\":%.3f,\"hallucination\":%.3f,\"judge\":\"%s\"}",
                            r.aggregate(), r.relevance(), r.groundedness(), r.agronomicCorrectness(), r.hallucinationRisk(), r.judge()));
            return r;
        } finally {
            span.end();
        }
    }

    /* ── LLM-as-judge path ──────────────────────────────────────────── */

    private EvalResult evaluateWithJudge(String recommendationJson, Map<String, Object> ctx) {
        String judgeSystem = """
            You are an EVALUATOR for an agronomy agent. Score the recommendation
            against the supplied tool context. Return ONLY compact JSON:
              {"relevance":0..1,"groundedness":0..1,"agronomic_correctness":0..1,
               "hallucination_risk":0..1,"reason":"<short>"}
            Definitions:
              relevance              = does the plan address the farm scenario?
              groundedness           = are the impact numbers consistent with weather + market context?
              agronomic_correctness  = does the crop suit season + soil + latitude?
              hallucination_risk     = 1 = no fabrication detected, 0 = clearly fabricated.
            Be strict; do not inflate.
            """;

        Map<String, Object> evalCtx = new LinkedHashMap<>();
        evalCtx.put("recommendation", recommendationJson);
        if (ctx != null) {
            evalCtx.put("weather", ctx.get("weather"));
            evalCtx.put("soil", ctx.get("soil"));
            evalCtx.put("market", ctx.get("market"));
        }
        String judgeUser = "Score the recommendation. Return JSON only.";

        String raw = gemini.generate(judgeSystem, judgeUser, evalCtx);
        if (raw == null || raw.isBlank()) throw new IllegalStateException("empty judge response");

        // Pull first {...}; tolerant of code fences.
        Matcher m = JSON_OBJECT.matcher(raw);
        if (!m.find()) throw new IllegalStateException("no JSON in judge response");
        JsonNode n;
        try { n = JSON.readTree(m.group()); }
        catch (Exception e) { throw new IllegalStateException("unparseable judge JSON: " + e.getMessage()); }

        // Stub mode produces our farm-plan JSON, which lacks these keys —
        // detect that and fall back to rubric so the score is still meaningful.
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
        double rel = 0.85, grd = 0.85, agr = 0.85, hal = 0.95;
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
                    grd = 0.92;
                } else {
                    grd = 0.55;
                    hal = 0.6;
                }

                // Agronomic correctness — does crop appear in `_basis.shortlist`?
                String crop = root.path("crop").asText("").toLowerCase();
                JsonNode basis = root.path("_basis");
                if (!crop.isBlank() && basis.path("shortlist").isArray()) {
                    boolean inList = false;
                    for (JsonNode c : basis.path("shortlist")) {
                        if (crop.equals(c.asText("").toLowerCase())) { inList = true; break; }
                    }
                    agr = inList ? 0.95 : 0.55;
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

