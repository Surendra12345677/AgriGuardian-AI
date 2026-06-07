package com.Hackathon.AgriGuardian.AI.api.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Response body returned to clients of the recommendation API. */
public record RecommendationResponse(
        String id,
        String farmId,
        String reasoning,
        double confidenceScore,
        List<String> tasks,
        Instant createdAt,
        String traceId,
        /** Aggregate Arize-style LLM-as-judge score (0..1). Null while eval is pending. */
        Double evalScore,
        /** Per-dimension breakdown: relevance, groundedness, agronomicCorrectness, hallucinationRisk. */
        Map<String, Object> evalDetails,
        /** Which judge produced this score. */
        String evalJudge
) {}
