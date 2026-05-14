package com.Hackathon.AgriGuardian.AI.api;

import com.Hackathon.AgriGuardian.AI.agent.AgentOrchestrator;
import com.Hackathon.AgriGuardian.AI.domain.repo.FarmRepository;
import com.Hackathon.AgriGuardian.AI.domain.repo.RecommendationRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Operator-only endpoints. Currently exposes a one-shot cache reset so a
 * judge / operator can force the next planner call to re-hit Gemini live
 * (useful right after a quota reset or model swap), plus a hard reset
 * that wipes all farms + recommendations so the deployed demo can be
 * returned to a clean slate between video takes / judging windows.
 */
@RestController
@RequestMapping("/api/v1/admin")
@Tag(name = "Admin", description = "Operator endpoints for cache + state control.")
public class AdminController {

    private final AgentOrchestrator orchestrator;
    private final FarmRepository farms;
    private final RecommendationRepository recs;

    public AdminController(AgentOrchestrator orchestrator,
                           FarmRepository farms,
                           RecommendationRepository recs) {
        this.orchestrator = orchestrator;
        this.farms = farms;
        this.recs = recs;
    }

    @PostMapping("/cache/clear")
    @Operation(summary = "Clear the in-memory recommendation cache",
            description = "Forces the next /recommendations call to invoke Gemini live "
                    + "instead of returning a cached (possibly offline-fallback) result.")
    public ResponseEntity<Map<String, Object>> clearCache() {
        int dropped = orchestrator.clearCache();
        return ResponseEntity.ok(Map.of(
                "ok", true,
                "droppedEntries", dropped,
                "message", "Recommendation cache cleared. Next call will hit Gemini live."
        ));
    }

    /**
     * Wipe every farm + recommendation document so the deployed demo
     * shows the clean "no farms yet, please onboard" state to judges.
     * Also clears the in-memory cache so no stale plan can leak through.
     *
     * <p>This is destructive — but the entire app is a hackathon demo,
     * not a system of record, so the trade-off is right.</p>
     */
    @PostMapping("/reset")
    @Operation(summary = "Wipe all farms + recommendations + cache (demo reset)",
            description = "Drops every farm and recommendation document and clears the "
                    + "in-memory recommendation cache. Used to return the deployed demo "
                    + "to an empty 'no farms yet' state between video takes / judges.")
    public ResponseEntity<Map<String, Object>> resetDemo() {
        long farmsBefore = farms.count();
        long recsBefore  = recs.count();
        recs.deleteAll();   // delete recs first so dangling FKs don't surface mid-wipe
        farms.deleteAll();
        int cacheDropped = orchestrator.clearCache();
        return ResponseEntity.ok(Map.of(
                "ok", true,
                "farmsDeleted",         farmsBefore,
                "recommendationsDeleted", recsBefore,
                "cacheEntriesDropped",  cacheDropped,
                "message", "Demo reset complete — dashboard will now show the clean onboarding state."
        ));
    }
}

