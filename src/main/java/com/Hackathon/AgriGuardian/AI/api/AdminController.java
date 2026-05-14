package com.Hackathon.AgriGuardian.AI.api;

import com.Hackathon.AgriGuardian.AI.agent.AgentOrchestrator;
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
 * (useful right after a quota reset or model swap).
 */
@RestController
@RequestMapping("/api/v1/admin")
@Tag(name = "Admin", description = "Operator endpoints for cache + state control.")
public class AdminController {

    private final AgentOrchestrator orchestrator;

    public AdminController(AgentOrchestrator orchestrator) {
        this.orchestrator = orchestrator;
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
}

