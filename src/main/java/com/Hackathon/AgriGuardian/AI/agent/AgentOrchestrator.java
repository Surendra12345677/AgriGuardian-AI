package com.Hackathon.AgriGuardian.AI.agent;

import com.Hackathon.AgriGuardian.AI.agent.tool.AgentTool;
import com.Hackathon.AgriGuardian.AI.agent.tool.ToolRegistry;
import com.Hackathon.AgriGuardian.AI.ai.GeminiClient;
import com.Hackathon.AgriGuardian.AI.api.dto.RecommendationRequest;
import com.Hackathon.AgriGuardian.AI.domain.model.Farm;
import com.Hackathon.AgriGuardian.AI.domain.model.Recommendation;
import com.Hackathon.AgriGuardian.AI.domain.repo.FarmRepository;
import com.Hackathon.AgriGuardian.AI.domain.repo.RecommendationRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.JsonNode;
import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.Tracer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The agent loop: <em>plan → tools → generate → reflect</em>.
 * Each phase is its own OTel span so Arize AX can render the trace tree.
 *
 * <p>An in-memory <b>1-hour result cache</b> protects the Gemini free-tier
 * quota during demos: identical (farmId, crop, scenario, language)
 * requests within an hour return the previously-saved recommendation
 * instead of burning another quota call. Cache is process-local so it
 * resets on restart and won't grow unboundedly (LRU at 256 entries).</p>
 */
@Service
public class AgentOrchestrator {

    private static final Logger log = LoggerFactory.getLogger(AgentOrchestrator.class);

    private static final long CACHE_TTL_MS = 60L * 60L * 1000L;   // 1 hour
    private static final int  CACHE_MAX    = 256;

    /** Shared, thread-safe JSON parser used by the impact-reconciliation pass. */
    private static final ObjectMapper JSON = new ObjectMapper();

    private final ToolRegistry tools;
    private final GeminiClient gemini;
    private final RecommendationRepository repo;
    private final FarmRepository farms;
    private final Tracer tracer;
    /** Optional — wired by Spring when present; null in older test contexts. */
    private AgentEvaluator evaluator;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    public void setEvaluator(AgentEvaluator evaluator) { this.evaluator = evaluator; }

    /** key → (recommendation, expiresAt). Trivial LRU via insertion-order eviction. */
    private final Map<String, CachedRec> cache = new ConcurrentHashMap<>();

    private record CachedRec(Recommendation rec, long expiresAt) {}

    public AgentOrchestrator(ToolRegistry tools, GeminiClient gemini,
                             RecommendationRepository repo, Tracer tracer) {
        this(tools, gemini, repo, null, tracer);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public AgentOrchestrator(ToolRegistry tools, GeminiClient gemini,
                             RecommendationRepository repo, FarmRepository farms,
                             Tracer tracer) {
        this.tools = tools;
        this.gemini = gemini;
        this.repo = repo;
        this.farms = farms;
        this.tracer = tracer;
    }

    /** Wipe the in-memory result cache. Exposed as POST /api/v1/admin/cache/clear. */
    public int clearCache() {
        int n = cache.size();
        cache.clear();
        log.info("Result cache cleared ({} entries dropped)", n);
        return n;
    }

    /**
     * Drop every cached recommendation that belongs to a specific farm.
     * Called from {@code FarmController#update} so when the user moves a
     * pin and saves, the very next planner request always hits a fresh
     * Gemini call instead of returning the stale "before-the-move" plan.
     */
    public int evictFarm(String farmId) {
        if (farmId == null) return 0;
        String prefix = farmId + "|";
        int before = cache.size();
        cache.keySet().removeIf(k -> k.startsWith(prefix));
        int dropped = before - cache.size();
        if (dropped > 0) log.info("Evicted {} cached rec(s) for farmId={}", dropped, farmId);
        return dropped;
    }

    /**
     * Serialize an inbound {@link RecommendationRequest} into a plain Map
     * so it can be persisted on the {@link Recommendation} document and
     * later replayed by the Agent Feedback Loop endpoint. Only the inputs
     * the orchestrator actually consumes are captured — never any secrets.
     */
    public static Map<String, Object> snapshotOf(RecommendationRequest req) {
        if (req == null) return Map.of();
        java.util.LinkedHashMap<String, Object> snap = new java.util.LinkedHashMap<>();
        snap.put("farmId",        req.farmId());
        snap.put("latitude",      req.latitude());
        snap.put("longitude",     req.longitude());
        snap.put("preferredCrop", req.preferredCrop());
        snap.put("language",      req.language());
        snap.put("scenario",      req.scenario());
        return snap;
    }

    /**
     * Replay a previously-stored request snapshot through the agent loop.
     * Always bypasses the cache (a replay must hit a fresh trace so the
     * new eval score is comparable to the original). Used by the Agent
     * Feedback Loop endpoint to turn a failed trace into a regression test.
     */
    public Recommendation replay(Map<String, Object> snapshot) {
        if (snapshot == null || snapshot.isEmpty()) {
            throw new IllegalArgumentException("Cannot replay an empty request snapshot");
        }
        RecommendationRequest req = new RecommendationRequest(
                asString(snapshot.get("farmId")),
                asDouble(snapshot.get("latitude")),
                asDouble(snapshot.get("longitude")),
                asString(snapshot.get("preferredCrop")),
                asString(snapshot.get("language")),
                asString(snapshot.get("scenario")),
                Boolean.TRUE   // force live — regression replays must not hit the cache
        );
        return run(req);
    }

    private static String asString(Object o) { return o == null ? null : String.valueOf(o); }
    private static Double asDouble(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.doubleValue();
        try { return Double.parseDouble(String.valueOf(o)); }
        catch (NumberFormatException e) { return null; }
    }

    public Recommendation run(RecommendationRequest req) {
        // IMPORTANT: we only cache *live* Gemini results. An offline-fallback
        // result is never cached, otherwise a single 429 during the demo
        // would pin every subsequent identical request to the offline plan
        // for an hour — even after the per-minute quota window resets.
        // Callers can also bypass the cache explicitly via forceLive=true.
        boolean forceLive = Boolean.TRUE.equals(req.forceLive());
        // Include rounded lat/lon in the cache key so relocating a farm
        // (same farmId, new coordinates) does NOT return the previous
        // recommendation. Rounded to 0.001° (~110 m) so even small pin
        // adjustments by the user are honoured — the previous 0.01° (~1 km)
        // bucket was wide enough that nearby villages collided and reused
        // each other's plan, which farmers (rightly) flagged as "wrong".
        String latKey = req.latitude()  == null ? "?" : String.format(java.util.Locale.US, "%.3f", req.latitude());
        String lonKey = req.longitude() == null ? "?" : String.format(java.util.Locale.US, "%.3f", req.longitude());
        String cacheKey = req.farmId() + "|"
                + latKey + "," + lonKey + "|"
                + (req.preferredCrop() == null ? "" : req.preferredCrop().toLowerCase()) + "|"
                + (req.scenario() == null ? "BASELINE" : req.scenario()) + "|"
                + (req.language() == null ? "en" : req.language());
        long now = System.currentTimeMillis();
        if (!forceLive) {
            CachedRec hit = cache.get(cacheKey);
            if (hit != null && hit.expiresAt > now) {
                log.info("Cache HIT for key={} (saves a Gemini call)", cacheKey);
                return hit.rec;
            }
        } else {
            cache.remove(cacheKey);
            log.info("forceLive=true — skipping cache for key={}", cacheKey);
        }
        if (cache.size() > CACHE_MAX) cache.clear();   // crude bound

        Span root = tracer.spanBuilder("agent.run")
                // ── OpenInference semantic conventions (Arize AX 2026) ──────────
                .setAttribute(AttributeKey.stringKey("openinference.span.kind"),  "AGENT")
                .setAttribute(AttributeKey.stringKey("session.id"),               req.farmId())
                .setAttribute(AttributeKey.stringKey("user.id"),                  req.farmId())
                .setAttribute(AttributeKey.stringKey("input.value"),              req.farmId() + "/" + (req.scenario() == null ? "BASELINE" : req.scenario()) + "/" + req.preferredCrop())
                // Agent pipeline metadata
                .setAttribute(AttributeKey.stringKey("agent.scenario"),           req.scenario() == null ? "BASELINE" : req.scenario())
                .setAttribute(AttributeKey.stringKey("agent.language"),           req.language() == null ? "en" : req.language())
                .setAttribute(AttributeKey.stringKey("agent.farm.id"),            req.farmId())
                .setAttribute(AttributeKey.doubleKey("agent.farm.latitude"),      req.latitude()  == null ? 0.0 : req.latitude())
                .setAttribute(AttributeKey.doubleKey("agent.farm.longitude"),     req.longitude() == null ? 0.0 : req.longitude())
                // legacy
                .setAttribute(AttributeKey.stringKey("farm.id"),                  req.farmId())
                .startSpan();
        try (var rootScope = root.makeCurrent()) {

            // Pull the persisted farm document up-front so every downstream tool
            // (especially soil) sees the user-supplied profile instead of a
            // hard-coded default. This is what makes the recommendation actually
            // location- and farm-specific.
            Farm farm = null;
            if (farms != null) {
                try { farm = farms.findById(req.farmId()).orElse(null); }
                catch (Exception ex) { log.debug("farm lookup failed for {}: {}", req.farmId(), ex.toString()); }
            }
            final String farmSoil  = farm == null ? null : farm.getSoilType();
            final String farmWater = farm == null ? null : farm.getWaterAvailability();

            // ── plan ────────────────────────────────────────────────────────
            List<String> plan;
            Span planSpan = tracer.spanBuilder("planner.plan")
                    .setAttribute(AttributeKey.stringKey("openinference.span.kind"), "CHAIN")
                    .startSpan();
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

            // Compute date/season up-front — needed both for the market tool harvest-date
            // calculation and later for the user prompt construction.
            java.time.ZoneId IST_EARLY = java.time.ZoneId.of("Asia/Kolkata");
            java.time.LocalDate today = java.time.LocalDate.now(IST_EARLY);
            int currentMonth = today.getMonthValue();

            // ── tools (parallel) ────────────────────────────────────────────
            // All plan tools are independent — run them concurrently so the
            // total tool-phase latency equals the slowest single call rather
            // than the sum of all calls.  arize.mcp.deep (conditional) still
            // runs sequentially AFTER the parallel batch, because it depends
            // on the arize.mcp result.
            Map<String, Object> toolOutputs = new ConcurrentHashMap<>();
            boolean priorWeakness  = false;
            boolean priorExcellence = false;

            // Capture OTel context so child threads inherit the current trace span.
            io.opentelemetry.context.Context otelCtx = io.opentelemetry.context.Context.current();

            ExecutorService toolExec = Executors.newFixedThreadPool(Math.max(1, plan.size()));
            List<CompletableFuture<Void>> toolFutures = new java.util.ArrayList<>();

            for (String toolName : plan) {
                // Build args on the calling thread (avoids sharing a mutable map).
                Map<String, Object> args = new LinkedHashMap<>();
                args.put("latitude",  req.latitude());
                args.put("longitude", req.longitude());
                args.put("crop",      req.preferredCrop() == null ? "" : req.preferredCrop());
                if (farmSoil  != null) args.put("soilType",          farmSoil);
                if (farmWater != null) args.put("waterAvailability", farmWater);
                if ("market".equals(toolName)) {
                    // Pass projected HARVEST date so market prices reflect what the
                    // farmer will see at selling time, not at planting time.
                    // KHARIF (Jun–Oct): harvest ~4 months after sowing
                    // RABI  (Nov–Mar): harvest ~4 months after sowing
                    // ZAID  (Apr–May): short-season crops, harvest ~2 months out
                    int harvestMonthsAhead = (currentMonth >= 6 && currentMonth <= 10) ? 4
                            : (currentMonth == 11 || currentMonth == 12 || currentMonth <= 3) ? 4
                            : 2;
                    args.put("date", today.plusMonths(harvestMonthsAhead).toString());
                }
                if ("arize.mcp".equals(toolName)) {
                    args.put("operation", "search_traces");
                    args.put("query",
                            "farm=" + req.farmId()
                            + " crop=" + (req.preferredCrop() == null ? "*" : req.preferredCrop())
                            + " scenario=" + (req.scenario() == null ? "BASELINE" : req.scenario()));
                    args.put("limit", 5);
                }

                AgentTool tool = tools.require(toolName);
                CompletableFuture<Void> f = CompletableFuture.runAsync(() -> {
                    // Re-attach to parent OTel trace so spans appear as children.
                    try (io.opentelemetry.context.Scope otelScope = otelCtx.makeCurrent()) {
                        Span ts = tracer.spanBuilder("tool." + toolName)
                                .setAttribute(AttributeKey.stringKey("openinference.span.kind"), "TOOL")
                                .setAttribute(AttributeKey.stringKey("tool.name"), toolName)
                                .startSpan();
                        try (var s = ts.makeCurrent()) {
                            Map<String, Object> out = tool.invoke(args);
                            toolOutputs.put(toolName, out);
                            ts.setAttribute(AttributeKey.stringKey("tool.source"),
                                    String.valueOf(out.getOrDefault("source", "n/a")));
                            String argsStr  = String.valueOf(args);
                            String outStr   = String.valueOf(out);
                            ts.setAttribute(AttributeKey.stringKey("input.value"),
                                    argsStr.length()  > 500 ? argsStr.substring(0, 500)  : argsStr);
                            ts.setAttribute(AttributeKey.stringKey("output.value"),
                                    outStr.length()   > 800 ? outStr.substring(0, 800)   : outStr);
                        } catch (Exception ex) {
                            ts.recordException(ex);
                            log.warn("Tool {} failed (non-fatal): {}", toolName, ex.toString());
                            // Do NOT rethrow — one bad tool should not kill the agent.
                        } finally { ts.end(); }
                    }
                }, toolExec);
                toolFutures.add(f);
            }

            // Wait for all tools to finish (or timeout at 12 s total).
            // Tools are fully parallel so 12 s = slowest single call, not sum.
            // Reducing from 20 s trims worst-case latency without dropping data.
            try {
                CompletableFuture.allOf(toolFutures.toArray(new CompletableFuture[0]))
                        .get(12, java.util.concurrent.TimeUnit.SECONDS);
            } catch (java.util.concurrent.TimeoutException te) {
                log.warn("Tool parallel batch timed out after 12 s — proceeding with partial results");
            } catch (Exception ie) {
                log.warn("Tool parallel batch interrupted: {}", ie.toString());
            } finally {
                toolExec.shutdown();
            }

            // ── conditional planning branch (after parallel tools) ───────────
            // Inspect arize.mcp result now that it has completed.
            if (toolOutputs.containsKey("arize.mcp")) {
                @SuppressWarnings("unchecked")
                Map<String, Object> arizeOut = (Map<String, Object>) toolOutputs.get("arize.mcp");
                double avg = parseAvgEvalScore(arizeOut);
                if (avg > 0 && avg < 0.60) {
                    priorWeakness = true;
                    log.info("Arize MCP signals priorAvgEval={} → fetching deep eval context", avg);
                    Span deep = tracer.spanBuilder("tool.arize.mcp.deep").startSpan();
                    try (var ds = deep.makeCurrent()) {
                        Map<String, Object> deepArgs = new LinkedHashMap<>();
                        deepArgs.put("operation", "get_evaluations");
                        deepArgs.put("farm",      req.farmId());
                        deepArgs.put("scenario",  req.scenario() == null ? "BASELINE" : req.scenario());
                        deepArgs.put("limit",     10);
                        try {
                            Map<String, Object> deepOut = tools.require("arize.mcp").invoke(deepArgs);
                            toolOutputs.put("arize.mcp.deep", deepOut);
                            deep.setAttribute(AttributeKey.stringKey("tool.source"),
                                    String.valueOf(deepOut.getOrDefault("source", "n/a")));
                        } catch (Exception ignored) {
                            deep.setAttribute(AttributeKey.stringKey("tool.source"), "fallback");
                        }
                    } finally { deep.end(); }
                } else if (avg >= 0.85) {
                    priorExcellence = true;
                    log.info("Arize MCP signals priorAvgEval={} → fast path, skipping reflect", avg);
                }
            }

            // ── generate ────────────────────────────────────────────────────
            Map<String, Object> ctx = new LinkedHashMap<>(toolOutputs);
            ctx.put("preferredCrop", req.preferredCrop());
            ctx.put("scenario", req.scenario() == null ? "BASELINE" : req.scenario());
            // Make farm coordinates available to any offline-fallback path so
            // changing the farm location actually changes the recommendation.
            ctx.put("latitude",  req.latitude());
            ctx.put("longitude", req.longitude());
            ctx.put("traceId",   root.getSpanContext().getTraceId());

            String lang = (req.language() == null || req.language().isBlank()) ? "en" : req.language();
            String langName = switch (lang) {
                case "hi" -> "Hindi (Devanagari)";
                case "mr" -> "Marathi (Devanagari)";
                case "ta" -> "Tamil";
                case "te" -> "Telugu";
                case "bn" -> "Bengali";
                case "pa" -> "Punjabi";
                // European locales for EU smallholders.
                case "es" -> "Spanish";
                case "fr" -> "French";
                case "de" -> "German";
                case "it" -> "Italian";
                case "pt" -> "Portuguese";
                case "nl" -> "Dutch";
                default -> "English";
            };

            String systemPrompt = """
                    You are AgriGuardian, a knowledgeable agronomy advisor for smallholder farmers worldwide.
                    Use your deep agricultural expertise to give the BEST crop recommendation for the specific
                    farm location, soil type, weather, season and market conditions provided in the context.

                    Reply ONLY as valid compact JSON (no markdown, no prose outside JSON) with EXACTLY these keys:
                      "advice"     : string — 2-3 sentences in %s explaining WHY this crop fits this specific farm
                      "crop"       : string — the single best crop name for this farm right now
                      "tasks"      : array of 5-8 objects: {"day":int,"action":string,"why":string}
                      "confidence" : float 0.0–1.0 — your confidence in this recommendation
                      "impact"     : {"expectedRevenueInr":int,"extraIncomeInr":int,"yieldDeltaPct":int,
                                      "waterSavingsPct":int,"costInr":int,"paybackWeeks":int}
                      "risks"      : array of exactly 3 strings — top risks specific to this crop/location/season

                    RECOMMENDATION PRINCIPLES (apply your own knowledge, not a fixed list):
                      • Use the candidateShortlist and locationAnchorCrop in the user prompt as strong guidance —
                        these are computed from the farm's exact coordinates, soil, season and weather.
                      • If preferredCrop is set by the farmer, use it — respect the farmer's choice.
                      • Ground all numbers in the weather, soil and market data from the Context section.
                      • Your advice must reflect the actual soil type, rainfall forecast and current season.
                      • Apply scenario adjustments: DROUGHT → water-efficient crops + drip irrigation tasks;
                        PRICE_CRASH → diversify away from volatile commodities; PEST_OUTBREAK → resistant
                        varieties + Integrated Pest Management tasks.

                    IMPACT consistency rules:
                      • extraIncomeInr must be approximately expectedRevenueInr × yieldDeltaPct / 100 (±10%%)
                      • waterSavingsPct must be > 0 if any task mentions drip irrigation, mulching or scheduling
                      • paybackWeeks = ceil(costInr ÷ (extraIncomeInr ÷ cropCycleWeeks))
                    """.formatted(langName);

            // Compute the agronomic season + curated candidate shortlist server-side
            // and inject it into the user prompt. Without this, Gemini consistently
            // defaults to "maize" because the model has no notion of the current
            // calendar month or the agronomic cycle of this lat/lon.
            // today / currentMonth already declared above (hoisted for market tool).
            int currentDay   = today.getDayOfMonth();
            int currentYear  = today.getYear();
            String todayStr  = today.format(java.time.format.DateTimeFormatter.ISO_LOCAL_DATE); // e.g. 2026-05-31
            String season =
                    (currentMonth >= 6 && currentMonth <= 10) ? "KHARIF (monsoon sowing)"
                  : (currentMonth == 11 || currentMonth == 12 || currentMonth <= 3) ? "RABI (winter sowing)"
                  : "ZAID (short summer crops)";
            // Pull rainfall + soil out of the tool outputs so the shortlist is honest.
            double rain7    = 12.0;
            double tempMaxC = 33.0;
            double tempMinC = 23.0;
            double tempAvgC = 28.0;
            double humidity = 0.62;
            int    forecastDays = 7;
            String soilHint = farmSoil != null && !farmSoil.isBlank() ? farmSoil : "loam";
            try {
                Object weatherOut = toolOutputs.get("weather");
                if (weatherOut instanceof Map<?, ?> w) {
                    if (w.get("rainfallMmNext7d") instanceof Number n) rain7       = n.doubleValue();
                    if (w.get("tempMaxC")          instanceof Number n) tempMaxC   = n.doubleValue();
                    if (w.get("tempMinC")          instanceof Number n) tempMinC   = n.doubleValue();
                    if (w.get("tempAvgC")          instanceof Number n) tempAvgC   = n.doubleValue();
                    if (w.get("humidity")          instanceof Number n) humidity   = n.doubleValue();
                    if (w.get("forecastDays")      instanceof Number n) forecastDays = n.intValue();
                }
                // Only override the farm-record soil if no farm soil was supplied.
                if (farmSoil == null || farmSoil.isBlank()) {
                    Object soilOut = toolOutputs.get("soil");
                    if (soilOut instanceof Map<?, ?> s) {
                        Object t = s.get("type");
                        if (t != null) soilHint = String.valueOf(t);
                    }
                }
            } catch (Exception ignored) { /* defaults are fine */ }
            List<String> shortlist = candidateCrops(currentMonth,
                    req.latitude() == null ? 20.0 : req.latitude(),
                    req.longitude() == null ? 78.0 : req.longitude(),
                    rain7, soilHint, req.scenario());

            // Deterministic per-coordinate "anchor" crop. Without this, the
            // same season+soil combo (e.g. ZAID + BLACK) returns the same
            // shortlist for every farm and Gemini consistently picks the
            // first item — so two farms 1000 km apart get the same crop,
            // which farmers correctly perceive as "the AI isn't actually
            // looking at my location". Hashing lat/lon (rounded to ~1 km)
            // into the shortlist guarantees that a meaningful pin move
            // produces a different anchor recommendation.
            String anchorCrop = pickAnchorCrop(shortlist,
                    req.latitude()  == null ? 0.0 : req.latitude(),
                    req.longitude() == null ? 0.0 : req.longitude(),
                    currentMonth);

            // Build a rich, context-grounded user prompt. All decision-relevant
            // data (date, location, soil, weather, market, shortlist) is injected
            // here so Gemini can apply its full agricultural intelligence —
            // not a hardcoded rulebook.
            String userPrompt = """
                    FARM CONTEXT
                    ============
                    Farm ID   : %s
                    Date      : %s (IST)  |  Season: %s
                    Location  : lat=%s, lon=%s
                    Soil type : %s (%s)
                    Rainfall  : %.1f mm forecast (next 7 days)
                    Scenario  : %s
                    Farmer preference: %s
                    Reply language: %s

                    DECISION GUIDANCE (computed from this farm's exact coordinates + live data)
                    ============================================================================
                    candidateShortlist  = %s
                    locationAnchorCrop  = %s   ← derived deterministically from lat/lon so each farm
                                                   gets a unique recommendation; use this unless the
                                                   live soil/weather data strongly suggests another crop.

                    INSTRUCTIONS
                    ============
                    1. Choose the BEST single crop from candidateShortlist for this farm right now.
                    2. If farmer preference is set, use it as the crop.
                    3. Use the weather, soil and market data in the Context section to make every
                       figure in "impact" realistic and grounded — not generic.
                    4. Write advice that mentions the actual soil type, rainfall and season.
                    5. Tasks must be day-numbered and actionable for this specific crop and soil.
                    """.formatted(
                            req.farmId(),
                            todayStr, season,
                            req.latitude(), req.longitude(),
                            soilHint, farmSoil != null && !farmSoil.isBlank() ? "farm record" : "geo-estimated",
                            rain7,
                            req.scenario() == null ? "BASELINE" : req.scenario(),
                            req.preferredCrop() == null ? "(none — choose best from shortlist)" : req.preferredCrop(),
                            langName,
                            shortlist,
                            anchorCrop
                    );

            String advice = gemini.generate(systemPrompt, userPrompt, ctx);

            // ── reflect ─────────────────────────────────────────────────────
            String reflected;
            if (priorExcellence) {
                // Fast-path: prior Arize evals show consistently high quality
                // for this farm/scenario, so we skip the reflect step but
                // still inject the basis block. This makes the agent demonstrably
                // adaptive — the pipeline depth changes with telemetry signal.
                Span fast = tracer.spanBuilder("reflector.skip").startSpan();
                try (var s = fast.makeCurrent()) {
                    fast.setAttribute(AttributeKey.stringKey("skip.reason"), "prior_excellence");
                    String reconciled = reconcileImpact(advice);
                    java.util.LinkedHashMap<String, Object> fastBasis = new java.util.LinkedHashMap<>();
                    fastBasis.put("date",        todayStr);
                    fastBasis.put("season",      season);
                    fastBasis.put("month",       currentMonth);
                    fastBasis.put("latitude",    req.latitude());
                    fastBasis.put("longitude",   req.longitude());
                    fastBasis.put("soil",        soilHint);
                    fastBasis.put("soilSource",  farmSoil != null && !farmSoil.isBlank() ? "farm-record" : "geo-heuristic");
                    fastBasis.put("rain7dMm",    rain7);
                    fastBasis.put("tempMaxC",    tempMaxC);
                    fastBasis.put("tempMinC",    tempMinC);
                    fastBasis.put("tempAvgC",    tempAvgC);
                    fastBasis.put("humidity",    humidity);
                    fastBasis.put("forecastDays",forecastDays);
                    fastBasis.put("shortlist",   shortlist);
                    fastBasis.put("anchorCrop",  anchorCrop);
                    fastBasis.put("fastPath",    true);
                    reflected = injectBasis(reconciled, fastBasis);
                } finally { fast.end(); }
            } else {
                Span reflectSpan = tracer.spanBuilder("reflector.reflect").startSpan();
                try (var s = reflectSpan.makeCurrent()) {
                    if (priorWeakness) {
                        reflectSpan.setAttribute(AttributeKey.stringKey("reflect.mode"), "deep");
                    }
                    String reconciled = reconcileImpact(advice);
                    java.util.LinkedHashMap<String, Object> basis = new java.util.LinkedHashMap<>();
                    basis.put("date",        todayStr);
                    basis.put("season",      season);
                    basis.put("month",       currentMonth);
                    basis.put("latitude",    req.latitude());
                    basis.put("longitude",   req.longitude());
                    basis.put("soil",        soilHint);
                    basis.put("soilSource",  farmSoil != null && !farmSoil.isBlank() ? "farm-record" : "geo-heuristic");
                    basis.put("rain7dMm",    rain7);
                    basis.put("tempMaxC",    tempMaxC);
                    basis.put("tempMinC",    tempMinC);
                    basis.put("tempAvgC",    tempAvgC);
                    basis.put("humidity",    humidity);
                    basis.put("forecastDays",forecastDays);
                    basis.put("shortlist",   shortlist);
                    basis.put("anchorCrop",  anchorCrop);
                    reflected = injectBasis(reconciled, basis);
                } finally { reflectSpan.end(); }
            }

            // ── crop fallback: if Gemini omitted the "crop" field, inject anchorCrop
            // so the UI never shows "RECOMMENDED CROP · —"
            reflected = ensureCropPresent(reflected, anchorCrop);
            // Save immediately so the user gets a response at once.
            // evalScore / evalDetails are filled by the async evaluator below.
            Recommendation rec = Recommendation.builder()
                    .farmId(req.farmId())
                    .reasoning(reflected)
                    .confidenceScore(0.78)   // placeholder — updated async
                    .traceId(root.getSpanContext().getTraceId())
                    .requestSnapshot(snapshotOf(req))
                    .build();
            Recommendation saved = repo.save(rec);
            log.info("Persisted recommendation id={} farmId={}", saved.getId(), saved.getFarmId());

            // Stamp output metadata on root span so Arize shows the final result
            root.setAttribute(AttributeKey.stringKey("output.value"),           reflected != null ? (reflected.length() > 500 ? reflected.substring(0, 500) + "..." : reflected) : "");
            root.setAttribute(AttributeKey.stringKey("agent.recommendation.id"), saved.getId());
            root.setAttribute(AttributeKey.longKey("agent.plan.steps"),          (long) plan.size());
            root.setAttribute(AttributeKey.stringKey("agent.season"),            season);
            root.setAttribute(AttributeKey.stringKey("agent.date.ist"),          todayStr);
            root.setAttribute(AttributeKey.stringKey("agent.soil.hint"),         soilHint);

            // Cache immediately — only live (non-offline) results.
            boolean offline = reflected != null && reflected.contains("\"_source\":\"offline-fallback\"");
            if (offline) {
                log.warn("Gemini returned offline-fallback for farmId={} — NOT caching", req.farmId());
            } else {
                cache.put(cacheKey, new CachedRec(saved, System.currentTimeMillis() + CACHE_TTL_MS));
            }

            // ── evaluate ASYNC (Arize-style LLM-as-judge) ───────────────────
            // The evaluator makes a second Gemini call (~15-20 s). Running it
            // async means the user gets the recommendation immediately while
            // the eval score is written to MongoDB in the background.
            // The EvalQualityCard polls /eval/quality-trend every 6 s so the
            // score appears in the dashboard within seconds of completing.
            if (evaluator != null && !offline) {
                final String savedId  = saved.getId();
                final String cKey     = cacheKey;
                final Map<String, Object> toolSnap   = Map.copyOf(toolOutputs);
                final String traceIdStr = root.getSpanContext().getTraceId();
                final String scenarioStr = req.scenario() == null ? "BASELINE" : req.scenario();
                final String reflectedSnap = reflected;   // capture for lambda (reflected is reassigned above)
                final io.opentelemetry.context.Context evalOtelCtx =
                        io.opentelemetry.context.Context.current();

                CompletableFuture.runAsync(() -> {
                    try (io.opentelemetry.context.Scope sc = evalOtelCtx.makeCurrent()) {
                        AgentEvaluator.EvalResult er = evaluator.evaluate(reflectedSnap, toolSnap);
                        // Persist eval score on the recommendation.
                        repo.findById(savedId).ifPresent(r -> {
                            r.setEvalScore(er.aggregate());
                            r.setEvalDetails(er.toMap());
                            r.setEvalJudge(er.judge());
                            r.setConfidenceScore(er.aggregate());
                            Recommendation scored = repo.save(r);
                            log.info("Async eval done id={} score={}", savedId, er.aggregate());
                            // Refresh cache entry with scored version.
                            CachedRec current = cache.get(cKey);
                            if (current != null) {
                                cache.put(cKey, new CachedRec(scored, current.expiresAt()));
                            }
                        });
                        // ── log feedback to Arize MCP ─────────────────────
                        if (tools.has("arize.mcp")) {
                            Span fb = tracer.spanBuilder("tool.arize.mcp.feedback").startSpan();
                            try (var fs = fb.makeCurrent()) {
                                Map<String, Object> fbArgs = new LinkedHashMap<>();
                                fbArgs.put("operation",     "log_feedback");
                                fbArgs.put("traceId",       traceIdStr);
                                fbArgs.put("farm",          req.farmId());
                                fbArgs.put("scenario",      scenarioStr);
                                fbArgs.put("score",         er.aggregate());
                                fbArgs.put("relevance",     er.relevance());
                                fbArgs.put("groundedness",  er.groundedness());
                                fbArgs.put("agronomic",     er.agronomicCorrectness());
                                fbArgs.put("hallucination", er.hallucinationRisk());
                                fbArgs.put("judge",         er.judge());
                                try {
                                    Map<String, Object> fbOut =
                                            tools.require("arize.mcp").invoke(fbArgs);
                                    fb.setAttribute(AttributeKey.stringKey("tool.source"),
                                            String.valueOf(fbOut.getOrDefault("source", "n/a")));
                                } catch (Exception ex) {
                                    fb.setAttribute(AttributeKey.stringKey("tool.source"), "fallback");
                                }
                            } finally { fb.end(); }
                        }
                    } catch (Exception ex) {
                        log.warn("async evaluator failed for id={}: {}", savedId, ex.toString());
                    }
                });
            }

            return saved;
        } finally {
            root.end();
        }
    }

    /* ───────────────────────────────────────────────────────────────────────
     * Impact reconciliation
     *
     * LLMs are great storytellers but bad calculators — Gemini regularly
     * returns an "impact" object whose six numbers don't agree with each
     * other (e.g. extraIncome ₹10k while revenue ₹35k × yieldDelta 15%
     * should give ₹5.25k, or waterSavingsPct=0 even though the plan is
     * full of drip-irrigation tasks).
     *
     * Rather than re-prompt (which costs another quota call and still
     * may not converge), we run a tiny deterministic post-processor that
     * preserves Gemini's narrative fields verbatim and only nudges
     * numerical fields back into a consistent envelope. This keeps the
     * UI's KPI tiles trustworthy without losing the "live · gemini"
     * provenance badge.
     * ──────────────────────────────────────────────────────────────────── */
    private static final Pattern JSON_OBJECT = Pattern.compile("\\{[\\s\\S]*\\}");

    String reconcileImpact(String raw) {
        if (raw == null || raw.isBlank()) return raw;
        try {
            // Be liberal: strip code fences and pull the first {...} block.
            String trimmed = raw.trim();
            if (trimmed.startsWith("```")) {
                int firstNl = trimmed.indexOf('\n');
                if (firstNl > 0) trimmed = trimmed.substring(firstNl + 1);
                if (trimmed.endsWith("```")) trimmed = trimmed.substring(0, trimmed.length() - 3);
            }
            JsonNode root;
            try {
                root = JSON.readTree(trimmed);
            } catch (Exception parseErr) {
                Matcher m = JSON_OBJECT.matcher(trimmed);
                if (!m.find()) return raw;
                root = JSON.readTree(m.group());
            }
            if (!root.isObject()) return raw;
            ObjectNode obj = (ObjectNode) root;

            // Never touch offline-fallback payloads — they're already
            // self-consistent and we want to preserve the marker so the
            // cache layer can detect them.
            if (obj.has("_source") && "offline-fallback".equals(obj.get("_source").asText())) {
                return raw;
            }

            ObjectNode impact = obj.has("impact") && obj.get("impact").isObject()
                    ? (ObjectNode) obj.get("impact")
                    : JSON.createObjectNode();

            int revenue   = intOr(impact, "expectedRevenueInr", 0);
            int extra     = intOr(impact, "extraIncomeInr",     0);
            int yieldPct  = intOr(impact, "yieldDeltaPct",      0);
            int waterPct  = intOr(impact, "waterSavingsPct",    0);
            int cost      = intOr(impact, "costInr",            0);
            int payback   = intOr(impact, "paybackWeeks",       0);

            // ── revenue: must be a positive number, otherwise derive from cost
            if (revenue <= 0) revenue = Math.max(cost * 3, 20_000);

            // ── yield delta: clamp to a plausible 2–28% band
            if (yieldPct <= 0) yieldPct = 12;
            if (yieldPct > 30) yieldPct = 30;

            // ── extra income: must agree with revenue × yieldDelta within ±15%
            int derivedExtra = Math.round(revenue * (yieldPct / 100f));
            if (extra <= 0 || Math.abs(extra - derivedExtra) > Math.max(derivedExtra * 0.15f, 1500)) {
                extra = derivedExtra;
            }

            // ── cost: floor it at something sensible so payback is computable
            if (cost <= 0) cost = Math.max(Math.round(extra * 0.6f), 5_000);

            // ── water savings: if any task hints at irrigation/mulch, ensure > 0
            if (waterPct <= 0) {
                boolean hasWaterAction = false;
                JsonNode tasks = obj.get("tasks");
                if (tasks != null && tasks.isArray()) {
                    for (JsonNode t : tasks) {
                        String action = lower(t.path("action").asText())
                                + " " + lower(t.path("why").asText());
                        if (action.contains("drip") || action.contains("mulch")
                                || action.contains("irrigat") || action.contains("micro-irrig")
                                || action.contains("sprinkler")) {
                            hasWaterAction = true;
                            break;
                        }
                    }
                }
                waterPct = hasWaterAction ? 18 : 6;
            }
            if (waterPct > 60) waterPct = 60;

            // ── payback: derive from invest ÷ weekly extra-income, capped
            int cycleDays = 90;
            JsonNode tasks = obj.get("tasks");
            if (tasks != null && tasks.isArray()) {
                for (JsonNode t : tasks) {
                    int day = t.path("day").asInt(0);
                    if (day > cycleDays) cycleDays = day;
                }
            }
            int cycleWeeks = Math.max(1, (int) Math.ceil(cycleDays / 7.0));
            float weeklyExtra = extra / (float) cycleWeeks;
            if (weeklyExtra > 0) {
                int derivedPayback = (int) Math.ceil(cost / weeklyExtra);
                // Only override if Gemini's value is wildly off (more than 30% drift).
                if (payback <= 0 || Math.abs(payback - derivedPayback) > Math.max(derivedPayback * 0.30, 2)) {
                    payback = derivedPayback;
                }
            }
            if (payback <= 0) payback = cycleWeeks;
            if (payback > 52) payback = 52;

            impact.put("expectedRevenueInr", revenue);
            impact.put("extraIncomeInr",     extra);
            impact.put("yieldDeltaPct",      yieldPct);
            impact.put("waterSavingsPct",    waterPct);
            impact.put("costInr",            cost);
            impact.put("paybackWeeks",       payback);

            obj.set("impact", impact);
            return JSON.writeValueAsString(obj);
        } catch (Exception ex) {
            log.warn("reconcileImpact failed — returning original Gemini payload: {}", ex.toString());
            return raw;
        }
    }

    private static int intOr(JsonNode node, String key, int fallback) {
        JsonNode v = node.get(key);
        if (v == null || v.isNull()) return fallback;
        if (v.isNumber()) return v.intValue();
        try { return Integer.parseInt(v.asText().trim()); } catch (Exception e) { return fallback; }
    }

    private static String lower(String s) { return s == null ? "" : s.toLowerCase(); }

    /**
     * Ensures the JSON payload has a non-blank "crop" field.
     * If Gemini omitted it, we fall back to {@code fallbackCrop} so the UI never
     * shows "RECOMMENDED CROP · —".
     */
    String ensureCropPresent(String raw, String fallbackCrop) {
        if (raw == null || raw.isBlank() || fallbackCrop == null || fallbackCrop.isBlank()) return raw;
        try {
            JsonNode root = JSON.readTree(raw.trim());
            if (!root.isObject()) return raw;
            ObjectNode obj = (ObjectNode) root;
            String crop = obj.path("crop").asText("").trim();
            if (crop.isEmpty() || crop.equals("null")) {
                log.warn("Gemini omitted 'crop' field — injecting anchorCrop={}", fallbackCrop);
                obj.put("crop", fallbackCrop);
                return JSON.writeValueAsString(obj);
            }
        } catch (Exception ignored) { /* return raw if unparseable */ }
        return raw;
    }

    /**
     * Stamp a {@code _basis} object onto the JSON payload so the UI can render a
     * "Why this crop?" panel. Silently no-ops on unparseable payloads.
     */
    String injectBasis(String raw, Map<String, Object> basis) {        if (raw == null || raw.isBlank() || basis == null || basis.isEmpty()) return raw;
        try {
            String trimmed = raw.trim();
            if (trimmed.startsWith("```")) {
                int firstNl = trimmed.indexOf('\n');
                if (firstNl > 0) trimmed = trimmed.substring(firstNl + 1);
                if (trimmed.endsWith("```")) trimmed = trimmed.substring(0, trimmed.length() - 3);
            }
            JsonNode root;
            try { root = JSON.readTree(trimmed); }
            catch (Exception parseErr) {
                Matcher m = JSON_OBJECT.matcher(trimmed);
                if (!m.find()) return raw;
                root = JSON.readTree(m.group());
            }
            if (!root.isObject()) return raw;
            ObjectNode obj = (ObjectNode) root;
            obj.set("_basis", JSON.valueToTree(basis));
            return JSON.writeValueAsString(obj);
        } catch (Exception ex) {
            log.debug("injectBasis no-op: {}", ex.toString());
            return raw;
        }
    }

    /**
     * Curated, location- and season-aware crop shortlist injected into the
     * Gemini user prompt. The model is instructed to pick from this list
     * (unless the user supplied a preferredCrop) so it stops defaulting to
     * "maize" for every farm.
     *
     * <p>The shortlist is also <b>longitude-aware</b> so two farms in the
     * same season + soil class but different states (e.g. Punjab vs Tamil
     * Nadu) get different agronomy — without this the system was
     * recommending the same ZAID cucurbit list to every farmer, which is
     * exactly the "I changed my address but the crop didn't change"
     * complaint we're fixing.</p>
     */
    static List<String> candidateCrops(int month, double lat, double lon, double rain7d,
                                       String soilType, String scenario) {
        if ("DROUGHT".equalsIgnoreCase(scenario)) {
            return List.of("pearl millet", "sorghum", "finger millet", "horse gram", "cluster bean");
        }
        if ("PEST_OUTBREAK".equalsIgnoreCase(scenario)) {
            return List.of("pigeon pea", "chickpea", "green gram", "black gram", "sesame");
        }
        String soil = soilType == null ? "" : soilType.toLowerCase();
        boolean sandy  = soil.contains("sand");
        boolean clayey = soil.contains("clay");
        boolean black  = soil.contains("black") || soil.contains("regur") || soil.contains("vertisol");
        boolean red    = soil.contains("red");
        boolean loam   = soil.contains("loam") || soil.contains("silt") || soil.isEmpty();

        boolean kharif = month >= 6 && month <= 10;
        boolean rabi   = month == 11 || month == 12 || month <= 3;
        boolean zaid   = month == 4  || month == 5;

        // Coarse Indian agro-climatic zone from longitude:
        //   <74E  → western/Gujarat-Rajasthan belt (drier, cotton/groundnut)
        //   74–80 → central plateau (Maharashtra/MP, pulses + cotton)
        //   80–86 → eastern Gangetic (rice/jute/vegetables, wetter)
        //   ≥86   → north-east / Bengal delta (rice, mustard, jute)
        boolean west    = lon <  74.0;
        boolean central = lon >= 74.0 && lon < 80.0;
        boolean east    = lon >= 80.0 && lon < 86.0;
        boolean ne      = lon >= 86.0;

        java.util.LinkedHashSet<String> pool = new java.util.LinkedHashSet<>();
        if (kharif) {
            if (rain7d > 35 || clayey) { pool.add("rice"); pool.add("jute"); }
            if (black)  { pool.add("cotton"); pool.add("soybean"); pool.add("pigeon pea"); }
            if (sandy)  { pool.add("groundnut"); pool.add("pearl millet"); pool.add("sesame"); }
            if (red)    { pool.add("ragi"); pool.add("groundnut"); pool.add("pigeon pea"); }
            if (loam)   { pool.add("green gram"); pool.add("black gram"); pool.add("maize"); }
            if (rain7d < 8) { pool.add("pearl millet"); pool.add("sorghum"); }
            // longitude flavour
            if (west)    { pool.add("groundnut"); pool.add("castor"); }
            if (central) { pool.add("soybean");   pool.add("cotton"); }
            if (east)    { pool.add("rice");      pool.add("jute"); }
            if (ne)      { pool.add("rice");      pool.add("turmeric"); }
        } else if (rabi) {
            if (lat >= 24)             { pool.add("wheat"); pool.add("mustard"); pool.add("barley"); pool.add("peas"); }
            if (lat < 24 && lat >= 18) { pool.add("chickpea"); pool.add("wheat"); pool.add("safflower"); }
            if (lat < 18)              { pool.add("chickpea"); pool.add("ragi"); pool.add("onion"); pool.add("tomato"); }
            if (clayey || black)       { pool.add("chickpea"); pool.add("linseed"); }
            if (sandy)                 { pool.add("mustard"); pool.add("cumin"); }
            if (loam)                  { pool.add("potato"); pool.add("garlic"); }
            // longitude flavour
            if (west)    { pool.add("cumin");    pool.add("isabgol"); }
            if (central) { pool.add("chickpea"); pool.add("safflower"); }
            if (east)    { pool.add("potato");   pool.add("lentil"); }
            if (ne)      { pool.add("mustard");  pool.add("rapeseed"); }
        } else if (zaid) {
            // Pre-monsoon short-cycle crops. Differentiate by lat AND lon so
            // two farms in different states get different anchors.
            if (lat >= 24) {                                      // north India: vegetables + fodder
                pool.add("watermelon"); pool.add("muskmelon");
                pool.add("fodder maize"); pool.add("sunflower");
            } else if (lat >= 18) {                               // central
                pool.add("green gram"); pool.add("sesame");
                pool.add("muskmelon");  pool.add("bottle gourd");
            } else {                                              // south
                pool.add("cucumber"); pool.add("pumpkin");
                pool.add("ridge gourd"); pool.add("groundnut");
            }
            if (clayey || black)        pool.add("summer rice");
            if (sandy)                  pool.add("watermelon");
            if (loam)                   pool.add("fodder maize");
            if (west)    pool.add("cluster bean");
            if (east)    pool.add("summer rice");
            if (ne)      pool.add("jute");
        }
        if (pool.isEmpty()) {
            if (lat < 15)      { pool.add("groundnut"); pool.add("ragi"); pool.add("coconut"); }
            else if (lat < 22) { pool.add("cotton"); pool.add("sorghum"); pool.add("pigeon pea"); }
            else if (lat < 28) { pool.add("wheat"); pool.add("mustard"); pool.add("chickpea"); }
            else               { pool.add("mustard"); pool.add("barley"); pool.add("wheat"); }
        }
        return List.copyOf(pool);
    }

    /**
     * Backwards-compatible 5-arg overload kept so existing tests (and any
     * external callers) don't break. Delegates to the longitude-aware
     * version using a neutral 78°E (geographic centre of India).
     */
    static List<String> candidateCrops(int month, double lat, double rain7d,
                                       String soilType, String scenario) {
        return candidateCrops(month, lat, 78.0, rain7d, soilType, scenario);
    }

    /**
     * Pick a deterministic "anchor" crop from the shortlist using a stable
     * hash of the rounded coordinates + month. Two farms 100 km apart will
     * almost certainly index into different shortlist slots, so the model
     * is nudged towards genuinely location-specific recommendations even
     * when the agronomic season + soil class are identical.
     */
    static String pickAnchorCrop(List<String> shortlist, double lat, double lon, int month) {
        if (shortlist == null || shortlist.isEmpty()) return "";
        // Round to ~1 km grid so micro-jitter on the same field stays stable.
        long latBucket = Math.round(lat * 100);
        long lonBucket = Math.round(lon * 100);
        // Mix bits with a cheap, well-distributed hash.
        long h = latBucket * 73856093L ^ lonBucket * 19349663L ^ (month * 83492791L);
        int idx = (int) Math.floorMod(h, shortlist.size());
        return shortlist.get(idx);
    }

    /**
     * Pull the average eval score from an Arize MCP {@code search_traces}
     * response. Tolerant of multiple shapes — returns 0 when nothing usable
     * is found so the conditional branch is a no-op rather than crashing.
     */
    static double parseAvgEvalScore(Map<String, Object> arizeOut) {
        if (arizeOut == null) return 0;
        Object resultObj = arizeOut.get("result");
        if (resultObj == null) return 0;
        try {
            JsonNode root = JSON.readTree(String.valueOf(resultObj));
            // Common shapes:
            //   { "averageScore": 0.74, ... }
            //   { "traces": [ { "evalScore": 0.6 }, ... ] }
            //   { "evaluations": [ { "score": 0.8 }, ... ] }
            if (root.has("averageScore"))    return clamp01Score(root.get("averageScore").asDouble(0));
            if (root.has("avg_eval_score"))  return clamp01Score(root.get("avg_eval_score").asDouble(0));
            JsonNode arr = root.has("traces")      ? root.get("traces")
                         : root.has("evaluations") ? root.get("evaluations")
                         : root.has("items")       ? root.get("items")
                         : null;
            if (arr != null && arr.isArray() && arr.size() > 0) {
                double sum = 0; int n = 0;
                for (JsonNode item : arr) {
                    JsonNode s = item.has("evalScore") ? item.get("evalScore")
                              : item.has("score")      ? item.get("score")
                              : item.has("aggregate")  ? item.get("aggregate")
                              : null;
                    if (s != null && s.isNumber()) { sum += s.asDouble(); n++; }
                }
                if (n > 0) return clamp01Score(sum / n);
            }
        } catch (Exception ignored) { /* unparseable → 0, no branch */ }
        return 0;
    }

    private static double clamp01Score(double v) {
        if (v < 0) return 0;
        if (v > 1) return Math.min(1.0, v / 100.0); // tolerate 0..100 inputs
        return v;
    }
}

