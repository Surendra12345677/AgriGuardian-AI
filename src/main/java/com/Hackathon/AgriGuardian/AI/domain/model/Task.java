package com.Hackathon.AgriGuardian.AI.domain.model;

import lombok.*;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.time.LocalDate;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "tasks")
public class Task {
    public enum Status { PENDING, DONE, SKIPPED, CANNOT_AFFORD, NOT_AVAILABLE }
    public enum Type { SOIL_PREP, SOWING, FERTILIZE, IRRIGATE, PEST_SCOUT, PESTICIDE, WEED, HARVEST, MARKET_SELL }

    @Id
    private String id;
    private String farmId;
    private int dayOffset;          // days from sowing
    private LocalDate scheduledDate;
    private Type type;
    private String description;
    private double estimatedCostInr;
    private String suggestedInput;  // e.g. "Urea 25kg" or "Neem oil 1L"
    @Builder.Default
    private Status status = Status.PENDING;
    private String farmerNote;
    private Instant updatedAt;
}

