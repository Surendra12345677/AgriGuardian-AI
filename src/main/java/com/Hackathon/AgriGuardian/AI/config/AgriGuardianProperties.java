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

    @Data
    public static class Gemini {
        /** API key — blank ⇒ stub mode kicks in. */
        private String apiKey = "";
        @NotBlank
        private String model = "gemini-2.0-flash";
        private String baseUrl = "https://generativelanguage.googleapis.com/v1beta";
        /** auto | always | never. */
        private String stubMode = "auto";
        private int timeoutSeconds = 30;
    }

    @Data
    public static class Arize {
        private boolean enabled = false;
        private String apiKey = "";
        private String spaceId = "";
        private String otlpEndpoint = "https://otlp.arize.com/v1";
        /** Optional — left blank when MCP is not used. */
        private String mcpUrl = "";
        private String projectName = "agriguardian-ai";
    }
}

