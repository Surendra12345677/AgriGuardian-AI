package com.Hackathon.AgriGuardian.AI.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * Inbound payload for {@code POST /api/v1/recommendations}.
 * <ul>
 *   <li>{@code preferredCrop} — null lets the agent pick freely.</li>
 *   <li>{@code language}     — ISO code (en, hi, mr, ta…). Defaults to en.</li>
 *   <li>{@code scenario}     — optional what-if hint: BASELINE | DROUGHT | PRICE_CRASH | PEST_OUTBREAK.</li>
 * </ul>
 */
public record RecommendationRequest(
        @NotBlank String farmId,
        @NotNull Double latitude,
        @NotNull Double longitude,
        String preferredCrop,
        String language,
        String scenario
) {}
