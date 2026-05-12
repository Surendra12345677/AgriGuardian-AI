package com.Hackathon.AgriGuardian.AI.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * Inbound payload for {@code POST /api/v1/recommendations}.
 * {@code preferredCrop} is optional — when null, the agent picks freely.
 */
public record RecommendationRequest(
        @NotBlank String farmId,
        @NotNull Double latitude,
        @NotNull Double longitude,
        String preferredCrop
) {}

