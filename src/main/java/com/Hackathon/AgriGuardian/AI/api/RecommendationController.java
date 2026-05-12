package com.Hackathon.AgriGuardian.AI.api;

import com.Hackathon.AgriGuardian.AI.agent.AgentOrchestrator;
import com.Hackathon.AgriGuardian.AI.api.dto.RecommendationRequest;
import com.Hackathon.AgriGuardian.AI.api.dto.RecommendationResponse;
import com.Hackathon.AgriGuardian.AI.domain.model.Recommendation;
import com.Hackathon.AgriGuardian.AI.domain.repo.RecommendationRepository;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.NoSuchElementException;

@RestController
@RequestMapping("/api/v1/recommendations")
public class RecommendationController {

    private final AgentOrchestrator orchestrator;
    private final RecommendationRepository repo;

    public RecommendationController(AgentOrchestrator orchestrator, RecommendationRepository repo) {
        this.orchestrator = orchestrator;
        this.repo = repo;
    }

    @PostMapping
    public ResponseEntity<RecommendationResponse> create(@Valid @RequestBody RecommendationRequest req) {
        Recommendation saved = orchestrator.run(req);
        return ResponseEntity.ok(toResponse(saved));
    }

    @GetMapping("/{id}")
    public ResponseEntity<RecommendationResponse> get(@PathVariable String id) {
        Recommendation rec = repo.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Recommendation not found: " + id));
        return ResponseEntity.ok(toResponse(rec));
    }

    private static RecommendationResponse toResponse(Recommendation r) {
        return new RecommendationResponse(
                r.getId(),
                r.getFarmId(),
                r.getReasoning(),
                List.of(), // tasks generation lives in a future ticket
                r.getCreatedAt(),
                r.getTraceId()
        );
    }
}

