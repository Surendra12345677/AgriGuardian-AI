package com.Hackathon.AgriGuardian.AI.ai;

import com.Hackathon.AgriGuardian.AI.config.AgriGuardianProperties;
import io.opentelemetry.api.trace.Tracer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Picks the appropriate {@link GeminiClient} bean based on configuration:
 * <ul>
 *   <li>{@code stub-mode=always} → stub</li>
 *   <li>{@code stub-mode=never}  → real (api-key required)</li>
 *   <li>{@code stub-mode=auto}   → real if api-key present, else stub</li>
 * </ul>
 */
@Configuration
public class GeminiClientConfig {

    private static final Logger log = LoggerFactory.getLogger(GeminiClientConfig.class);

    @Bean
    public GeminiClient geminiClient(AgriGuardianProperties props, Tracer tracer) {
        AgriGuardianProperties.Gemini cfg = props.getGemini();
        String mode = cfg.getStubMode() == null ? "auto" : cfg.getStubMode().toLowerCase();
        boolean hasKey = cfg.getApiKey() != null && !cfg.getApiKey().isBlank();

        boolean useStub = switch (mode) {
            case "always" -> true;
            case "never" -> false;
            default -> !hasKey;
        };

        if (useStub) {
            log.info("GeminiClient: stub mode active (configured stub-mode={}, hasKey={}).", mode, hasKey);
            return new GeminiClientStub();
        }
        log.info("GeminiClient: real Gemini API active (model={}).", cfg.getModel());
        return new GeminiClientReal(cfg, tracer);
    }
}

