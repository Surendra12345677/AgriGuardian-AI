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
        private String model = "gemini-3-pro";
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
        /** When true, no external HTTP call is made; uses deterministic in-memory pricing. */
        private boolean useMock = true;
        /** Reserved for a future real provider (e.g. AGMARKNET). */
        private String baseUrl = "";
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

