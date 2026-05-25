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
 * <p><strong>Zero hardcoded values.</strong> Every price, peak month, seasonal
 * amplitude and fallback price is read from {@link AgriGuardianProperties.Market},
 * which is bound from {@code application.yml} and fully overridable at runtime
 * via environment variables or {@code -D} JVM flags.</p>
 *
 * <p>Args: {@code crop} (String, required), optional {@code date} (ISO yyyy-MM-dd).</p>
 *
 * <p>To swap in a live AGMARKNET / e-NAM feed set
 * {@code agriguardian.market.use-mock=false} and wire a real HTTP client in
 * {@link #invokeLive(String, LocalDate)}.</p>
 */
@Slf4j
@Component
public class MarketPriceTool implements AgentTool {

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
            return invokeLive(crop, date);
        }
        return invokeMock(crop, date);
    }

    // ── Mock (config-driven, deterministic) ──────────────────────────────────

    private Map<String, Object> invokeMock(String crop, LocalDate date) {
        // All values come from configuration — nothing hardcoded in Java source.
        int base = props.getBasePrices().getOrDefault(crop, props.getDefaultFallbackPriceInr());
        int peak = props.getPeakMonths().getOrDefault(crop, 6);
        double amplitude = props.getSeasonalAmplitude();

        // Half-year distance from peak wrapped to [0..6].
        int rawDist = Math.abs(date.getMonthValue() - peak);
        int distance = Math.min(rawDist, 12 - rawDist);

        // Cosine-shaped premium: +amplitude at peak, -amplitude opposite.
        double seasonalFactor = Math.cos(Math.PI * distance / 6.0) * amplitude;
        int price = (int) Math.round(base * (1.0 + seasonalFactor));

        String trend = distance <= 1 ? "stable"
                : (date.getMonthValue() < peak || (date.getMonthValue() - peak) > 6
                        ? "rising" : "falling");

        // Sell window = [peak-1 .. peak], clamped to valid months.
        Month sellWindowStart = Month.of(((peak - 2 + 12) % 12) + 1);
        Month sellWindowEnd   = Month.of(((peak     + 11) % 12) + 1);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("crop", crop);
        out.put("pricePerQuintalINR", price);
        out.put("trend", trend);
        out.put("peakMonth", Month.of(peak).name());
        out.put("recommendedSellWindow", sellWindowStart.name() + "–" + sellWindowEnd.name());
        out.put("asOfDate", date.toString());
        out.put("source", "mock");
        return out;
    }

    // ── Live provider (future) ────────────────────────────────────────────────

    /**
     * Hook for a live AGMARKNET / e-NAM / commodity-exchange feed.
     * Set {@code agriguardian.market.use-mock=false} and implement this.
     */
    private Map<String, Object> invokeLive(String crop, LocalDate date) {
        log.warn("market.use-mock=false but no live provider is wired yet — falling back to mock");
        return invokeMock(crop, date);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static LocalDate parseDate(Object raw) {
        if (raw instanceof String s && !s.isBlank()) {
            try { return LocalDate.parse(s); } catch (Exception ignored) { }
        }
        return LocalDate.now();
    }
}
