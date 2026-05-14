package com.Hackathon.AgriGuardian.AI.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * Inbound payload for {@code POST /api/v1/recommendations}.
 * <ul>
 *   <li>{@code preferredCrop} — null lets the agent pick freely.</li>
 *   <li>{@code language}     — ISO code (en, hi, mr, ta…). Defaults to en.</li>
 *   <li>{@code scenario}     — optional what-if hint: BASELINE | DROUGHT | PRICE_CRASH | PEST_OUTBREAK.</li>
 *   <li>{@code forceLive}    — when {@code true}, skip the result cache and
 *       force a fresh Gemini call. Useful when a previous request landed on
 *       the offline-fallback path and you want to retry now that quota /
 *       network has recovered.</li>
 * </ul>
 */
public record RecommendationRequest(
        @NotBlank String farmId,
        @NotNull Double latitude,
        @NotNull Double longitude,
        String preferredCrop,
        String language,
        String scenario,
        Boolean forceLive
) {}
