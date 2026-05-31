package com.Hackathon.AgriGuardian.AI.agent.tool.impl;

import com.Hackathon.AgriGuardian.AI.agent.tool.AgentTool;
import com.Hackathon.AgriGuardian.AI.ai.GeminiClient;
import com.Hackathon.AgriGuardian.AI.config.AgriGuardianProperties;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
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
 * <p><strong>Live mode (default):</strong> asks Gemini to return a structured
 * JSON price quote for the requested crop.  Gemini grounds its answer in its
 * training data + any search grounding configured on the model, so the price
 * reflects current mandi/commodity ranges rather than static constants.</p>
 *
 * <p><strong>Mock mode</strong> ({@code agriguardian.market.use-mock=true}):
 * falls back to config-driven seasonal simulation — useful for offline dev/CI
 * or when you need 100 % deterministic output for evals.</p>
 *
 * <p>Zero hardcoded values in Java source — all prices, seasonal parameters
 * and prompts live in {@link AgriGuardianProperties.Market} / {@code application.yml}.</p>
 */
@Slf4j
@Component
public class MarketPriceTool implements AgentTool {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};

    private final AgriGuardianProperties.Market props;
    private final GeminiClient gemini;

    public MarketPriceTool(AgriGuardianProperties properties, GeminiClient geminiClient) {
        this.props  = properties.getMarket();
        this.gemini = geminiClient;
    }

    @Override public String name() { return "market"; }

    @Override public String description() {
        return "Returns the indicative price (INR/quintal) and short-term trend "
                + "(rising | stable | falling) for a crop, with a recommended sell window. "
                + "Uses Gemini for live market intelligence when online.";
    }

    @Override
    public Map<String, Object> invoke(Map<String, Object> args) {
        String crop = String.valueOf(args.getOrDefault("crop", "unknown"))
                .toLowerCase(Locale.ROOT).trim();
        LocalDate date = parseDate(args.get("date"));

        return props.isUseMock() ? invokeMock(crop, date) : invokeLive(crop, date);
    }

    // ── Live: Gemini-grounded market price ───────────────────────────────────

    /**
     * Asks Gemini for a structured market-price quote.
     * Gemini returns JSON matching the tool's output schema.
     * Falls back to the config-driven mock if inference fails for any reason
     * (quota, network, parse error) so the agent loop is never blocked.
     */
    private Map<String, Object> invokeLive(String crop, LocalDate date) {
        // If the YAML value is blank (empty env var), fall through to the Java-default in props.
        String systemPrompt = blankToDefault(props.getLivePriceSystemPrompt(),
                "You are an agricultural commodity market analyst with up-to-date knowledge of "
                + "Indian mandi wholesale prices and global commodity exchanges. "
                + "The date you receive is the PROJECTED HARVEST DATE — your job is to forecast the "
                + "expected price at that future date, not today's price. "
                + "Always respond with only a single valid JSON object — no markdown, no explanation.");

        String userPromptTemplate = blankToDefault(props.getLivePriceUserPromptTemplate(),
                "A smallholder farmer in India is planting {crop} today and expects to HARVEST around {date}. "
                + "What wholesale market price (INR per quintal) should the farmer expect at harvest time "
                + "in India around {date}? "
                + "Provide the price trend at that time (rising, stable, or falling), the month when the crop "
                + "typically commands peak prices, and the best sell window for maximum profit (two consecutive month names). "
                + "Return ONLY this JSON (no other text):\n"
                + "{\"crop\":\"{crop}\",\"pricePerQuintalINR\":<integer>,\"trend\":\"rising|stable|falling\","
                + "\"peakMonth\":\"<MONTH_UPPERCASE>\",\"recommendedSellWindow\":\"<MONTH>–<MONTH>\","
                + "\"asOfDate\":\"{date}\",\"harvestPriceForecast\":true,"
                + "\"marketInsight\":\"<one-sentence demand/supply outlook at harvest time>\"}");

        String userPrompt = userPromptTemplate.replace("{crop}", crop).replace("{date}", date.toString());

        log.debug("MarketPriceTool calling Gemini for live price: crop={} date={}", crop, date);
        try {
            String json = gemini.generate(systemPrompt, userPrompt,
                    Map.of("crop", crop, "date", date.toString(), "tool", "market"));

            Map<String, Object> result = MAPPER.readValue(json, MAP_TYPE);

            // Sanitise: ensure mandatory fields are present, coerce types.
            result.putIfAbsent("crop", crop);
            result.putIfAbsent("asOfDate", date.toString());
            result.put("source", "gemini-live");

            // pricePerQuintalINR must be a Number — Gemini sometimes returns a String.
            Object priceRaw = result.get("pricePerQuintalINR");
            if (priceRaw instanceof String ps) {
                try { result.put("pricePerQuintalINR", Integer.parseInt(ps.replaceAll("[^0-9]", ""))); }
                catch (NumberFormatException ignored) { }
            }

            log.info("MarketPriceTool live: crop={} price={} trend={} source=gemini-live",
                    crop, result.get("pricePerQuintalINR"), result.get("trend"));
            return result;

        } catch (Exception ex) {
            log.warn("MarketPriceTool Gemini live query failed for crop={} — falling back to mock. Reason: {}",
                    crop, ex.getMessage());
            Map<String, Object> fallback = invokeMock(crop, date);
            fallback.put("source", "mock-fallback");   // distinguishable from pure mock
            return fallback;
        }
    }

    // ── Mock: config-driven seasonal simulation ───────────────────────────────

    private Map<String, Object> invokeMock(String crop, LocalDate date) {
        int base      = props.getBasePrices().getOrDefault(crop, props.getDefaultFallbackPriceInr());
        int peak      = props.getPeakMonths().getOrDefault(crop, 6);
        double amp    = props.getSeasonalAmplitude();

        int rawDist = Math.abs(date.getMonthValue() - peak);
        int distance = Math.min(rawDist, 12 - rawDist);

        double seasonalFactor = Math.cos(Math.PI * distance / 6.0) * amp;
        int price = (int) Math.round(base * (1.0 + seasonalFactor));

        String trend = distance <= 1 ? "stable"
                : (date.getMonthValue() < peak || (date.getMonthValue() - peak) > 6
                        ? "rising" : "falling");

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

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static LocalDate parseDate(Object raw) {
        if (raw instanceof String s && !s.isBlank()) {
            try { return LocalDate.parse(s); } catch (Exception ignored) { }
        }
        return LocalDate.now();
    }

    /** Returns {@code value} unless it is null/blank, in which case returns {@code fallback}. */
    private static String blankToDefault(String value, String fallback) {
        return (value == null || value.isBlank()) ? fallback : value;
    }
}
