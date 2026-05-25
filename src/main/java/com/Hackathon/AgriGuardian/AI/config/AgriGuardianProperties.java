package com.Hackathon.AgriGuardian.AI.config;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Strongly-typed configuration for AgriGuardian. Bound from the
 * {@code agriguardian.*} section of {@code application.yml}.
 */
@Data
@ConfigurationProperties(prefix = "agriguardian")
public class AgriGuardianProperties {

    private final Gemini gemini = new Gemini();
    private final Arize arize = new Arize();
    private final Weather weather = new Weather();
    private final Market market = new Market();
    private final Mcp mcp = new Mcp();

    @Data
    public static class Gemini {
        /** API key — blank ⇒ stub mode kicks in. */
        private String apiKey = "";
        @NotBlank
        private String model = "gemini-3-pro-preview";
        /**
         * Ordered list of models to try when the primary {@link #model} fails
         * (HTTP 404 unknown-model, 429 quota, 5xx). Prevents the demo from
         * ever falling into the deterministic offline plan when at least one
         * generally-available Gemini model can still serve the request.
         */
        private java.util.List<String> fallbackModels = new java.util.ArrayList<>(java.util.List.of(
                "gemini-3-flash-preview",   // stay inside the Gemini 3 family first
                "gemini-2.5-pro",
                "gemini-2.5-flash",
                "gemini-2.0-flash"
        ));
        private String baseUrl = "https://generativelanguage.googleapis.com/v1beta";
        /** auto | always | never. */
        private String stubMode = "auto";
        private int timeoutSeconds = 30;
    }

    /** Arize AX — observability + (via {@link Mcp.ArizeMcp}) the partner track. */
    @Data
    public static class Arize {
        private boolean enabled = false;
        private String apiKey = "";
        private String spaceId = "";
        private String otlpEndpoint = "https://otlp.arize.com/v1";
        private String projectName = "agriguardian-ai";
    }


    @Data
    public static class Weather {
        /** Base URL of the Open-Meteo forecast service. */
        private String baseUrl = "https://api.open-meteo.com/v1";
        /** Number of forecast days to request (1..16). */
        private int forecastDays = 7;
        private int timeoutSeconds = 10;
    }

    @Data
    public static class Market {
        /** When true, no external HTTP call is made; uses config-driven in-memory pricing. */
        private boolean useMock = true;
        /** Reserved for a future real provider (e.g. AGMARKNET). */
        private String baseUrl = "";

        /**
         * Fallback ₹/quintal when a crop is not listed in {@link #basePrices}.
         * Overridable via {@code MARKET_DEFAULT_PRICE} env var.
         */
        private int defaultFallbackPriceInr = 2000;

        /**
         * Seasonal price-swing amplitude as a fraction of base price.
         * 0.12 → ±12 % from base at peak / opposite-peak.
         * Overridable via {@code MARKET_SEASONAL_AMPLITUDE} env var.
         */
        private double seasonalAmplitude = 0.12;

        /**
         * Base ₹/quintal keyed by <em>lowercase</em> crop name.
         * Every entry can be overridden via {@code application.yml} or at
         * runtime via {@code agriguardian.market.base-prices.wheat=2500} etc.
         */
        private java.util.Map<String, Integer> basePrices = new java.util.LinkedHashMap<>(
                java.util.Map.ofEntries(
                        java.util.Map.entry("wheat",     2425),
                        java.util.Map.entry("rice",      2200),
                        java.util.Map.entry("maize",     2090),
                        java.util.Map.entry("soybean",   4600),
                        java.util.Map.entry("cotton",    7500),
                        java.util.Map.entry("sugarcane",  340),
                        java.util.Map.entry("onion",     1800),
                        java.util.Map.entry("tomato",    1500),
                        java.util.Map.entry("potato",    1200),
                        java.util.Map.entry("groundnut", 6377),
                        java.util.Map.entry("watermelon",1950),
                        java.util.Map.entry("muskmelon", 1750),
                        java.util.Map.entry("sunflower", 5800),
                        java.util.Map.entry("mustard",   5650),
                        java.util.Map.entry("chickpea",  5440),
                        java.util.Map.entry("lentil",    6200)
                )
        );

        /**
         * Approx peak-demand month per crop (1 = Jan … 12 = Dec).
         * Every entry can be overridden via {@code application.yml} or at
         * runtime via {@code agriguardian.market.peak-months.wheat=4} etc.
         */
        private java.util.Map<String, Integer> peakMonths = new java.util.LinkedHashMap<>(
                java.util.Map.ofEntries(
                        java.util.Map.entry("wheat",      4),
                        java.util.Map.entry("rice",      10),
                        java.util.Map.entry("maize",     11),
                        java.util.Map.entry("soybean",   10),
                        java.util.Map.entry("cotton",    12),
                        java.util.Map.entry("sugarcane",  2),
                        java.util.Map.entry("onion",      6),
                        java.util.Map.entry("tomato",     8),
                        java.util.Map.entry("potato",     3),
                        java.util.Map.entry("groundnut", 11),
                        java.util.Map.entry("watermelon", 5),
                        java.util.Map.entry("muskmelon",  5),
                        java.util.Map.entry("sunflower",  4),
                        java.util.Map.entry("mustard",    3),
                        java.util.Map.entry("chickpea",   3),
                        java.util.Map.entry("lentil",     4)
                )
        );
    }

    /**
     * Model Context Protocol (MCP) partner integrations.
     *
     * <p>The hackathon track we submit to is <strong>Arize</strong>, so
     * {@link ArizeMcp} is the primary partner integration. {@link MongoDb}
     * is kept as a secondary "action" tool so the agent can persist farm plans.</p>
     */
    @Data
    public static class Mcp {
        private final ArizeMcp arize = new ArizeMcp();
        private final MongoDb mongodb = new MongoDb();

        /** Arize MCP — partner-track qualifier. */
        @Data
        public static class ArizeMcp {
            private boolean enabled = false;
            private String url = "";
            private String apiKey = "";
            private String spaceId = "";
            private int timeoutSeconds = 15;
        }

        @Data
        public static class MongoDb {
            private boolean enabled = false;
            private String url = "http://localhost:3000/mcp";
            private int timeoutSeconds = 15;
        }
    }
}

