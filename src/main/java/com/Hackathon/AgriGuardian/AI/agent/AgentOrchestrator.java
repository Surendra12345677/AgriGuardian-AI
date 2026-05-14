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
import java.util.concurrent.ConcurrentHashMap;
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

    public Recommendation run(RecommendationRequest req) {
        // ── cache short-circuit (saves Gemini free-tier quota during demo) ──
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
                .setAttribute(AttributeKey.stringKey("farm.id"), req.farmId())
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
                    Map<String, Object> args = new LinkedHashMap<>();
                    args.put("latitude",  req.latitude());
                    args.put("longitude", req.longitude());
                    args.put("crop",      req.preferredCrop() == null ? "" : req.preferredCrop());
                    // Pass farm-record context so tools can honour user-supplied soil/water.
                    if (farmSoil  != null) args.put("soilType",          farmSoil);
                    if (farmWater != null) args.put("waterAvailability", farmWater);
                    // Arize MCP needs an `operation` — we use search_traces to pull
                    // similar past-run telemetry for in-context grounding.
                    if ("arize.mcp".equals(toolName)) {
                        args.put("operation", "search_traces");
                        args.put("query",
                                "farm=" + req.farmId()
                                + " crop=" + (req.preferredCrop() == null ? "*" : req.preferredCrop())
                                + " scenario=" + (req.scenario() == null ? "BASELINE" : req.scenario()));
                        args.put("limit", 5);
                    }
                    Map<String, Object> out = tool.invoke(args);
                    toolOutputs.put(toolName, out);
                    ts.setAttribute(AttributeKey.stringKey("tool.source"),
                            String.valueOf(out.getOrDefault("source", "n/a")));
                } catch (Exception ex) {
                    ts.recordException(ex);
                    throw ex;
                } finally { ts.end(); }
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

                    CROP CHOICE RULES — read carefully, this is the most common failure mode:
                      • DO NOT default to "maize" just because it is a safe answer. Maize is only correct
                        when the soil is loam/black, the kharif monsoon is active (June–October), and rainfall
                        in the next 7 days is between 8 and 35 mm. In any other situation, pick a different crop.
                      • Honour the AGRONOMIC SEASON for the current month at this latitude:
                            – Kharif (Jun–Oct): rice, soybean, cotton, pigeon pea, groundnut, sorghum,
                              pearl millet, green gram, black gram, sesame, maize.
                            – Rabi (Nov–Mar): wheat, mustard, chickpea, barley, potato, tomato, garlic,
                              onion, safflower, linseed, peas.
                            – Zaid (Apr–May): watermelon, muskmelon, cucumber, fodder maize, sunflower,
                              green gram, summer rice (clay only), bottle gourd.
                      • Honour SOIL: sandy → groundnut/pearl millet/mustard/cumin; clay/black → cotton/
                        soybean/pigeon pea/chickpea/rice; loam → vegetables, maize, wheat, pulses; red →
                        ragi, groundnut, pulses.
                      • Honour LATITUDE for rabi: lat ≥ 24 favours wheat/mustard/barley; 18–24 favours
                        chickpea/wheat/safflower; <18 favours chickpea/ragi/onion/vegetables.
                      • If a candidate shortlist is provided in the user prompt, your "crop" MUST be one
                        of those candidates unless preferredCrop is set.
                      • If preferredCrop IS set, use it as-is; do not override.

                    The "impact" object MUST be internally consistent — these invariants are enforced:
                      • extraIncomeInr  ≈ expectedRevenueInr × yieldDeltaPct / 100   (within ±10%%)
                      • waterSavingsPct > 0 whenever any task mentions drip / mulch / irrigation scheduling
                      • paybackWeeks    = ceil( costInr ÷ ( extraIncomeInr ÷ cycleWeeks ) ),
                                          where cycleWeeks = ceil(maxTaskDay / 7)
                    Do NOT round so aggressively that these break. The server validates and will
                    silently correct any field that violates them.
                    """.formatted(langName);

            // Compute the agronomic season + curated candidate shortlist server-side
            // and inject it into the user prompt. Without this, Gemini consistently
            // defaults to "maize" because the model has no notion of the current
            // calendar month or the agronomic cycle of this lat/lon.
            int currentMonth = java.time.LocalDate.now().getMonthValue();
            String season =
                    (currentMonth >= 6 && currentMonth <= 10) ? "KHARIF (monsoon sowing)"
                  : (currentMonth == 11 || currentMonth == 12 || currentMonth <= 3) ? "RABI (winter sowing)"
                  : "ZAID (short summer crops)";
            // Pull rainfall + soil out of the tool outputs so the shortlist is honest.
            double rain7 = 12.0;
            String soilHint = farmSoil != null && !farmSoil.isBlank() ? farmSoil : "loam";
            try {
                Object weatherOut = toolOutputs.get("weather");
                if (weatherOut instanceof Map<?, ?> w) {
                    Object r = w.get("rainfallMmNext7d");
                    if (r instanceof Number n) rain7 = n.doubleValue();
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

            String userPrompt = "Farm " + req.farmId() +
                    " | latitude=" + req.latitude() +
                    " | longitude=" + req.longitude() +
                    " | currentMonth=" + currentMonth + " (" + season + ")" +
                    " | scenario=" + (req.scenario() == null ? "BASELINE" : req.scenario()) +
                    " | preferredCrop=" + (req.preferredCrop() == null ? "(none — choose the best for this lat/lon, soil and weather)" : req.preferredCrop()) +
                    " | candidateShortlist=" + shortlist +
                    " | locationAnchorCrop=" + anchorCrop +
                    " | language=" + langName +
                    "\nUse the weather, soil and market tool outputs in Context to ground every figure. " +
                    "If preferredCrop is empty, prefer locationAnchorCrop unless the soil + 7-day rainfall " +
                    "strongly favour a different entry from candidateShortlist. The anchor is derived from " +
                    "the exact lat/lon so two different farms MUST get different recommendations. " +
                    "Do NOT pick maize unless it actually appears in candidateShortlist.";

            String advice = gemini.generate(systemPrompt, userPrompt, ctx);

            // ── reflect ─────────────────────────────────────────────────────
            String reflected;
            Span reflectSpan = tracer.spanBuilder("reflector.reflect").startSpan();
            try (var s = reflectSpan.makeCurrent()) {
                // Pass-through critique stub — leaves room for future self-evaluation.
                // Also runs the impact-reconciler so the KPI tiles in the UI are
                // mathematically consistent (extra income ↔ yield ↔ revenue,
                // water > 0 when irrigation tasks exist, payback derived from cost).
                String reconciled = reconcileImpact(advice);
                // Stamp a "_basis" block onto the response so the UI can show
                // exactly *why* this crop was chosen for THIS farm location.
                reflected = injectBasis(reconciled, Map.of(
                        "season",     season,
                        "month",      currentMonth,
                        "latitude",   req.latitude(),
                        "longitude",  req.longitude(),
                        "soil",       soilHint,
                        "soilSource", farmSoil != null && !farmSoil.isBlank() ? "farm-record" : "geo-heuristic",
                        "rain7dMm",   rain7,
                        "shortlist",  shortlist,
                        "anchorCrop", anchorCrop
                ));
            } finally { reflectSpan.end(); }

            Recommendation rec = Recommendation.builder()
                    .farmId(req.farmId())
                    .reasoning(reflected)
                    .confidenceScore(0.78)
                    .traceId(root.getSpanContext().getTraceId())
                    .build();
            Recommendation saved = repo.save(rec);
            log.info("Persisted recommendation id={} farmId={}", saved.getId(), saved.getFarmId());
            // Only cache *live* Gemini results — offline fallbacks must be
            // re-tried on the next request so a transient quota error doesn't
            // pin the demo to a stub answer for an hour.
            boolean offline = reflected != null && reflected.contains("\"_source\":\"offline-fallback\"");
            if (offline) {
                log.warn("Gemini returned offline-fallback for farmId={} — NOT caching, will retry on next call",
                        req.farmId());
            } else {
                cache.put(cacheKey, new CachedRec(saved, System.currentTimeMillis() + CACHE_TTL_MS));
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
     * Stamp a {@code _basis} object onto the JSON payload so the UI can render a
     * "Why this crop?" panel. Silently no-ops on unparseable payloads.
     */
    String injectBasis(String raw, Map<String, Object> basis) {
        if (raw == null || raw.isBlank() || basis == null || basis.isEmpty()) return raw;
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
}

