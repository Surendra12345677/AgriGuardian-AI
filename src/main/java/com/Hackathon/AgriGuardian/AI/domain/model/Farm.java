package com.Hackathon.AgriGuardian.AI.domain.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "farms")
public class Farm {
    @Id
    private String id;
    private String farmerName;
    private String contact;
    private double latitude;
    private double longitude;
    private double landSizeAcres;
    private String waterAvailability; // LOW | MEDIUM | HIGH
    private String soilType;          // LOAM | CLAY | SANDY | BLACK | RED
    private double budgetInr;
    private String chosenCrop;        // set after recommendation accepted
    private Instant sowingDate;
    private double cumulativePesticideKg;
    private double cumulativeFertilizerKg;
    @Builder.Default
    private Instant createdAt = Instant.now();
}

