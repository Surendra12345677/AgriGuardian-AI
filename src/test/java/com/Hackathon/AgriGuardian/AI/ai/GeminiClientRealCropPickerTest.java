package com.Hackathon.AgriGuardian.AI.ai;

import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Regression tests for the offline crop-picker.
 *
 * <p>Earlier the picker hard-coded {@code "soybean"} for any farm between
 * 15° N and 22° N — meaning every demo run from Hyderabad / Pune / Nagpur
 * looked identical. These tests guarantee diversity across season, soil
 * and neighbouring coordinates.</p>
 */
class GeminiClientRealCropPickerTest {

    @Test
    void picksDifferentCropsForNeighbouringFarmsInSameRegion() {
        // Five farms within ~1° of Hyderabad (lat 17.43, lon 78.38).
        Set<String> crops = new HashSet<>();
        for (int i = 0; i < 5; i++) {
            crops.add(GeminiClientReal.pickCropForLocation(
                    17.43 + i * 0.17,
                    78.38 + i * 0.11,
                    12.0, 30.0, "BLACK", "BASELINE", 7 /* July, kharif */));
        }
        assertThat(crops)
                .as("Five neighbouring farms should not all be told to plant soybean")
                .hasSizeGreaterThan(1);
    }

    @Test
    void respectsSeasonality() {
        String kharif = GeminiClientReal.pickCropForLocation(
                28.6, 77.2, 20.0, 30.0, "loam", "BASELINE", 7);   // July
        String rabi   = GeminiClientReal.pickCropForLocation(
                28.6, 77.2, 5.0, 18.0, "loam", "BASELINE", 12);   // December
        assertThat(kharif).isNotEqualTo(rabi);
    }

    @Test
    void droughtScenarioRotatesAcrossDryCrops() {
        Set<String> crops = new HashSet<>();
        for (int i = 0; i < 5; i++) {
            crops.add(GeminiClientReal.pickCropForLocation(
                    20.0 + i * 0.3, 75.0 + i * 0.3,
                    2.0, 36.0, "sandy", "DROUGHT", 6));
        }
        assertThat(crops).hasSizeGreaterThan(1);
        assertThat(crops).doesNotContain("soybean");
    }
}

