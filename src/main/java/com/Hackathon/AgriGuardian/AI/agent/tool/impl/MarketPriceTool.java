package com.Hackathon.AgriGuardian.AI.agent.tool.impl;

import com.Hackathon.AgriGuardian.AI.agent.tool.AgentTool;
import com.Hackathon.AgriGuardian.AI.config.AgriGuardianProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.Month;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Market price tool.
 *
 * <p>Deterministic mock backed by per-crop base prices and a sinusoidal seasonal
 * factor (peak around harvest months). Output is stable for a given (crop, date)
 * so judges and tests get reproducible numbers, while still varying meaningfully
 * across crops + time of year.</p>
 *
 * <p>Args: {@code crop} (String, required), optional {@code date} (ISO yyyy-MM-dd).</p>
 *
 * <p>TODO: swap for live AGMARKNET / e-NAM feed when an API key becomes available;
 * controlled by {@code agriguardian.market.use-mock=false}.</p>
 */
@Slf4j
@Component
public class MarketPriceTool implements AgentTool {

    /** Base ₹/quintal — calibrated to typical Indian mandi ranges (May 2026). */
    private static final Map<String, Integer> BASE_PRICES = Map.of(
            "wheat",     2425,
            "rice",      2200,
            "maize",     2090,
            "soybean",   4600,
            "cotton",    7500,
            "sugarcane",  340,
            "onion",     1800,
            "tomato",    1500,
            "potato",    1200,
            "groundnut", 6377
    );

    /** Approx peak-demand month per crop (1..12) — drives the seasonal factor. */
    private static final Map<String, Integer> PEAK_MONTH = Map.of(
            "wheat",     Month.APRIL.getValue(),
            "rice",      Month.OCTOBER.getValue(),
            "maize",     Month.NOVEMBER.getValue(),
            "soybean",   Month.OCTOBER.getValue(),
            "cotton",    Month.DECEMBER.getValue(),
            "sugarcane", Month.FEBRUARY.getValue(),
            "onion",     Month.JUNE.getValue(),
            "tomato",    Month.AUGUST.getValue(),
            "potato",    Month.MARCH.getValue(),
            "groundnut", Month.NOVEMBER.getValue()
    );

    private final AgriGuardianProperties.Market props;

    public MarketPriceTool(AgriGuardianProperties properties) {
        this.props = properties.getMarket();
    }

    @Override public String name() { return "market"; }

    @Override public String description() {
        return "Returns the indicative price (INR/quintal) and short-term trend "
                + "(rising | stable | falling) for a crop, with a recommended sell window.";
    }

    @Override
    public Map<String, Object> invoke(Map<String, Object> args) {
        String crop = String.valueOf(args.getOrDefault("crop", "unknown"))
                .toLowerCase(Locale.ROOT).trim();
        LocalDate date = parseDate(args.get("date"));

        if (!props.isUseMock()) {
            // Hook for the future real provider; for now log and fall through to mock.
            log.info("market.use-mock=false but no live provider wired yet — using mock");
        }

        int base = BASE_PRICES.getOrDefault(crop, 2000);
        int peak = PEAK_MONTH.getOrDefault(crop, 6);

        // Distance (in months) from peak, wrapped to [0..6].
        int distance = Math.min(Math.abs(date.getMonthValue() - peak),
                12 - Math.abs(date.getMonthValue() - peak));
        // Cosine-shaped premium: +12 % at peak, -12 % opposite.
        double seasonalFactor = Math.cos(Math.PI * distance / 6.0) * 0.12;
        int price = (int) Math.round(base * (1.0 + seasonalFactor));

        String trend = distance <= 1 ? "stable"
                : (date.getMonthValue() < peak || date.getMonthValue() - peak > 6 ? "rising" : "falling");

        Month sellWindowStart = Month.of(((peak - 2 + 11) % 12) + 1);
        Month sellWindowEnd   = Month.of(((peak     + 11) % 12) + 1);

        // LinkedHashMap to preserve key order in JSON for nicer demo output.
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("crop", crop);
        out.put("pricePerQuintalINR", price);
        out.put("trend", trend);
        out.put("peakMonth", Month.of(peak).name());
        out.put("recommendedSellWindow", sellWindowStart.name() + "–" + sellWindowEnd.name());
        out.put("asOfDate", date.toString());
        out.put("source", props.isUseMock() ? "mock" : "mock-fallback");
        return out;
    }

    private static LocalDate parseDate(Object raw) {
        if (raw instanceof String s && !s.isBlank()) {
            try { return LocalDate.parse(s); } catch (Exception ignored) { }
        }
        return LocalDate.now();
    }
}

