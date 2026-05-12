package com.Hackathon.AgriGuardian.AI.api.dto;

import java.time.Instant;
import java.util.List;

/** Response body returned to clients of the recommendation API. */
public record RecommendationResponse(
        String id,
        String farmId,
        String advice,
        List<String> tasks,
        Instant createdAt,
        String traceId
) {}

