package com.Hackathon.AgriGuardian.AI.domain.model;

import lombok.*;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "recommendations")
public class Recommendation {
    @Id
    private String id;
    private String farmId;
    private List<CropRecommendation> candidates;
    private String reasoning;          // human-readable rationale
    private double confidenceScore;    // 0..1 from model self-eval
    private String traceId;            // OTel trace id for Arize lookup
    /** Aggregate Arize-style eval score (0..1) computed by AgentEvaluator. */
    private Double evalScore;
    /** Per-dimension eval breakdown (relevance/groundedness/agronomic_correctness/hallucination_risk). */
    private Map<String, Object> evalDetails;
    /** Which judge produced the eval ("gemini-llm-judge" | "rubric-deterministic"). */
    private String evalJudge;

    /* ── Agent feedback loop (Arize-style "failed-traces-as-regression-tests") ──
     * When a recommendation lands below the eval threshold, the dashboard
     * lets the operator label WHY it failed and what the agent should have
     * done instead. Those labels are stored on the recommendation itself so
     * the next replay can compare "before vs. after" without losing the
     * original failure mode. {@code replayOfId} threads a chain of replays
     * back to the original failed trace; {@code requestSnapshot} captures
     * the exact inbound payload so a replay can be reproduced byte-for-byte
     * even if the user has moved on from the original farm context.
     */
    /** "wrong_tool_sequence" | "missed_retrieval" | "stale_context" | "skipped_validation" | "bad_answer" | "other". */
    private String failureMode;
    /** Human-written expected behaviour ("the agent should have …"). */
    private String expectedBehavior;
    /** When non-null, this recommendation is a replay of the recommendation with that id. */
    private String replayOfId;
    /** Snapshot of the inbound RecommendationRequest so a future run can replay it. */
    private Map<String, Object> requestSnapshot;

    @Builder.Default
    private Instant createdAt = Instant.now();

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CropRecommendation {
        private String cropName;
        private double expectedProfitInr;
        private String riskLevel;             // LOW | MEDIUM | HIGH
        private double sustainabilityScore;   // 0..100
        private double waterDemandScore;      // 0..100 lower = better for low water
        private String rationale;
    }
}
