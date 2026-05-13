package com.Hackathon.AgriGuardian.AI.agent;

import com.Hackathon.AgriGuardian.AI.agent.tool.AgentTool;
import com.Hackathon.AgriGuardian.AI.agent.tool.ToolRegistry;
import com.Hackathon.AgriGuardian.AI.ai.GeminiClient;
import com.Hackathon.AgriGuardian.AI.api.dto.RecommendationRequest;
import com.Hackathon.AgriGuardian.AI.domain.model.Recommendation;
import com.Hackathon.AgriGuardian.AI.domain.repo.RecommendationRepository;
import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.Tracer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The agent loop: <em>plan → tools → generate → reflect</em>.
 * Each phase is its own OTel span so Arize AX can render the trace tree.
 */
@Service
public class AgentOrchestrator {

    private static final Logger log = LoggerFactory.getLogger(AgentOrchestrator.class);

    private final ToolRegistry tools;
    private final GeminiClient gemini;
    private final RecommendationRepository repo;
    private final Tracer tracer;

    public AgentOrchestrator(ToolRegistry tools, GeminiClient gemini,
                             RecommendationRepository repo, Tracer tracer) {
        this.tools = tools;
        this.gemini = gemini;
        this.repo = repo;
        this.tracer = tracer;
    }

    public Recommendation run(RecommendationRequest req) {
        Span root = tracer.spanBuilder("agent.run")
                .setAttribute(AttributeKey.stringKey("farm.id"), req.farmId())
                .startSpan();
        try (var rootScope = root.makeCurrent()) {

            // ── plan ────────────────────────────────────────────────────────
            List<String> plan;
            Span planSpan = tracer.spanBuilder("planner.plan").startSpan();
            try (var s = planSpan.makeCurrent()) {
                // Plan rationale (Arize partner-track integration first):
                //   1. arize.mcp — retrieve evaluation history of similar past
                //      runs to inform reasoning (partner-track qualifier).
                //   2. weather / soil / market — ground-truth data tools.
                //   3. mongo.mcp — persist the resulting plan (action tool).
                List<String> p = new java.util.ArrayList<>();
                if (tools.has("arize.mcp")) p.add("arize.mcp");
                p.add("weather");
                p.add("soil");
                p.add("market");
                if (tools.has("mongo.mcp")) p.add("mongo.mcp");
                plan = List.copyOf(p);
                planSpan.setAttribute(AttributeKey.stringArrayKey("plan.tools"), plan);
            } finally { planSpan.end(); }

            // ── tools ───────────────────────────────────────────────────────
            Map<String, Object> toolOutputs = new LinkedHashMap<>();
            for (String toolName : plan) {
                Span ts = tracer.spanBuilder("tool." + toolName).startSpan();
                try (var s = ts.makeCurrent()) {
                    AgentTool tool = tools.require(toolName);
                    Map<String, Object> args = Map.of(
                            "latitude",  req.latitude(),
                            "longitude", req.longitude(),
                            "crop",      req.preferredCrop() == null ? "" : req.preferredCrop()
                    );
                    Map<String, Object> out = tool.invoke(args);
                    toolOutputs.put(toolName, out);
                } catch (Exception ex) {
                    ts.recordException(ex);
                    throw ex;
                } finally { ts.end(); }
            }

            // ── generate ────────────────────────────────────────────────────
            Map<String, Object> ctx = new LinkedHashMap<>(toolOutputs);
            ctx.put("preferredCrop", req.preferredCrop());
            ctx.put("scenario", req.scenario() == null ? "BASELINE" : req.scenario());

            String lang = (req.language() == null || req.language().isBlank()) ? "en" : req.language();
            String langName = switch (lang) {
                case "hi" -> "Hindi (Devanagari)";
                case "mr" -> "Marathi (Devanagari)";
                case "ta" -> "Tamil";
                case "te" -> "Telugu";
                case "bn" -> "Bengali";
                case "pa" -> "Punjabi";
                default -> "English";
            };

            String systemPrompt = """
                    You are AgriGuardian, a careful agronomy advisor for smallholder Indian farmers.
                    Produce a SEASON PLAN that maximises farmer income while respecting water and soil limits.
                    Reply ONLY as compact valid JSON (no markdown fences) with EXACTLY these keys:
                      "advice"     : string, 2-3 sentences in %s
                      "crop"       : string, the recommended crop
                      "tasks"      : array of {"day": int, "action": string, "why": string}
                      "confidence" : float between 0 and 1
                      "impact"     : { "expectedRevenueInr": int, "extraIncomeInr": int,
                                       "yieldDeltaPct": int, "waterSavingsPct": int,
                                       "costInr": int, "paybackWeeks": int }
                      "risks"      : array of strings (top 3 risks for this scenario)
                    Apply scenario stress-tests: if scenario is DROUGHT, prefer drought-tolerant crops and
                    drip irrigation; PRICE_CRASH → diversify; PEST_OUTBREAK → resistant varieties + IPM.
                    """.formatted(langName);

            String userPrompt = "Farm " + req.farmId() +
                    " | scenario=" + (req.scenario() == null ? "BASELINE" : req.scenario()) +
                    " | preferredCrop=" + (req.preferredCrop() == null ? "(none)" : req.preferredCrop()) +
                    " | language=" + langName;

            String advice = gemini.generate(systemPrompt, userPrompt, ctx);

            // ── reflect ─────────────────────────────────────────────────────
            String reflected;
            Span reflectSpan = tracer.spanBuilder("reflector.reflect").startSpan();
            try (var s = reflectSpan.makeCurrent()) {
                // Pass-through critique stub — leaves room for future self-evaluation.
                reflected = advice;
            } finally { reflectSpan.end(); }

            Recommendation rec = Recommendation.builder()
                    .farmId(req.farmId())
                    .reasoning(reflected)
                    .confidenceScore(0.78)
                    .traceId(root.getSpanContext().getTraceId())
                    .build();
            Recommendation saved = repo.save(rec);
            log.info("Persisted recommendation id={} farmId={}", saved.getId(), saved.getFarmId());
            return saved;
        } finally {
            root.end();
        }
    }
}

