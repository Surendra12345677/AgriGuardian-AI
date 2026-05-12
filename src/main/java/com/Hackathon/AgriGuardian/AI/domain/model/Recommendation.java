package com.Hackathon.AgriGuardian.AI.domain.model;

import lombok.*;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.List;

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

