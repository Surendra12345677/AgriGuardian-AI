package com.Hackathon.AgriGuardian.AI.agent.tool.impl;

import com.Hackathon.AgriGuardian.AI.config.AgriGuardianProperties;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class MarketPriceToolTest {

    private MarketPriceTool tool() {
        return new MarketPriceTool(new AgriGuardianProperties());
    }

    @Test
    void invoke_knownCrop_returnsDeterministicShape() {
        Map<String, Object> out = tool().invoke(Map.of(
                "crop", "wheat",
                "date", "2026-04-15"        // close to the wheat peak
        ));

        assertThat(out).containsKeys("crop", "pricePerQuintalINR", "trend",
                                     "peakMonth", "recommendedSellWindow", "asOfDate", "source");
        assertThat(out).containsEntry("crop", "wheat")
                       .containsEntry("peakMonth", "APRIL")
                       .containsEntry("trend", "stable")
                       .containsEntry("source", "mock");
        assertThat((Integer) out.get("pricePerQuintalINR")).isBetween(2400, 2750);
    }

    @Test
    void invoke_unknownCrop_fallsBackToBaseRange() {
        Map<String, Object> out = tool().invoke(Map.of("crop", "saffron", "date", "2026-06-01"));
        assertThat(out).containsEntry("crop", "saffron");
        assertThat((Integer) out.get("pricePerQuintalINR")).isBetween(1700, 2300);
    }

    @Test
    void invoke_isDeterministic_forSameInputs() {
        var t = tool();
        var a = t.invoke(Map.of("crop", "rice", "date", "2026-10-01"));
        var b = t.invoke(Map.of("crop", "rice", "date", "2026-10-01"));
        assertThat(a).isEqualTo(b);
    }
}

