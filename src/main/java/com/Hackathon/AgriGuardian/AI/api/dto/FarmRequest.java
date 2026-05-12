package com.Hackathon.AgriGuardian.AI.api.dto;

import jakarta.validation.constraints.*;

/**
 * Inbound payload for {@code POST /api/v1/farms} — onboarding a new farm.
 *
 * <p>Validated by {@code @Valid} in the controller; failures roll up into the
 * standard RFC 7807 {@link com.Hackathon.AgriGuardian.AI.api.GlobalExceptionHandler}.</p>
 */
public record FarmRequest(
        @NotBlank @Size(max = 80)
        String farmerName,

        @Size(max = 120)
        String contact,

        @DecimalMin("-90.0")  @DecimalMax("90.0")
        double latitude,

        @DecimalMin("-180.0") @DecimalMax("180.0")
        double longitude,

        @DecimalMin("0.01") @DecimalMax("10000.0")
        double landSizeAcres,

        @Pattern(regexp = "LOW|MEDIUM|HIGH", message = "must be LOW | MEDIUM | HIGH")
        String waterAvailability,

        @Pattern(regexp = "LOAM|CLAY|SANDY|BLACK|RED", message = "must be LOAM | CLAY | SANDY | BLACK | RED")
        String soilType,

        @DecimalMin("0.0") @DecimalMax("100000000.0")
        double budgetInr
) { }

