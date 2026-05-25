package com.Hackathon.AgriGuardian.AI.agent.tool.impl;

import com.Hackathon.AgriGuardian.AI.config.AgriGuardianProperties;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class MarketPriceToolTest {

    /** Build the tool in mock mode with a null GeminiClient — live path never called. */
    private MarketPriceTool tool() {
        AgriGuardianProperties props = new AgriGuardianProperties();
        props.getMarket().setUseMock(true);   // force mock so no Gemini call
        return new MarketPriceTool(props, (sys, user, ctx) -> {
            throw new UnsupportedOperationException("Gemini should not be called in mock mode");
        });
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

    @Test
    void invoke_live_usesGeminiAndReturnsSourceGeminiLive() {
        // Simulate a Gemini response with a valid JSON market quote.
        AgriGuardianProperties props = new AgriGuardianProperties();
        props.getMarket().setUseMock(false);
        String fakeGeminiJson = """
                {"crop":"wheat","pricePerQuintalINR":2480,"trend":"rising",
                 "peakMonth":"APRIL","recommendedSellWindow":"MARCH–APRIL",
                 "asOfDate":"2026-05-25","marketInsight":"Demand uptick ahead of rabi procurement."}
                """;
        MarketPriceTool liveTool = new MarketPriceTool(props, (sys, user, ctx) -> fakeGeminiJson);

        Map<String, Object> out = liveTool.invoke(Map.of("crop", "wheat", "date", "2026-05-25"));

        assertThat(out).containsEntry("source", "gemini-live")
                       .containsEntry("trend", "rising")
                       .containsKey("marketInsight");
        assertThat((Integer) out.get("pricePerQuintalINR")).isEqualTo(2480);
    }

    @Test
    void invoke_live_fallsBackToMockWhenGeminiFails() {
        AgriGuardianProperties props = new AgriGuardianProperties();
        props.getMarket().setUseMock(false);
        MarketPriceTool liveTool = new MarketPriceTool(props,
                (sys, user, ctx) -> { throw new RuntimeException("Gemini quota exceeded"); });

        Map<String, Object> out = liveTool.invoke(Map.of("crop", "rice", "date", "2026-10-01"));

        assertThat(out).containsEntry("source", "mock-fallback");
        assertThat((Integer) out.get("pricePerQuintalINR")).isGreaterThan(0);
    }
}

