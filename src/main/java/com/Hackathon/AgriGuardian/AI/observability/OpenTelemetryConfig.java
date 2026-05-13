package com.Hackathon.AgriGuardian.AI.observability;

import com.Hackathon.AgriGuardian.AI.config.AgriGuardianProperties;
import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.common.Attributes;
import io.opentelemetry.api.trace.Tracer;
import io.opentelemetry.exporter.otlp.http.trace.OtlpHttpSpanExporter;
import io.opentelemetry.sdk.OpenTelemetrySdk;
import io.opentelemetry.sdk.resources.Resource;
import io.opentelemetry.sdk.trace.SdkTracerProvider;
import io.opentelemetry.sdk.trace.export.BatchSpanProcessor;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;
import java.util.concurrent.TimeUnit;

/**
 * OpenTelemetry wiring — partner-track Arize integration.
 *
 * <p>When {@code agriguardian.arize.enabled=true} and an API key + space id
 * are present, every Gemini call + tool invocation is exported as an OTLP/HTTP
 * trace span to Arize AX (https://otlp.arize.com/v1). Judges can watch traces
 * stream into the Arize dashboard live during the demo — this is the partner
 * "superpower" that qualifies the project for the Arize prize bucket.</p>
 *
 * <p>When Arize is disabled (or credentials are missing), we silently fall back
 * to a no-op tracer so unit tests + offline dev still work.</p>
 */
@Slf4j
@Configuration
public class OpenTelemetryConfig {

    private static final String INSTRUMENTATION_NAME = "agriguardian.agent";
    private static final String SERVICE_VERSION = "0.1.0";

    private SdkTracerProvider sdkTracerProvider; // kept for graceful shutdown

    @Bean
    public OpenTelemetry openTelemetry(AgriGuardianProperties props) {
        AgriGuardianProperties.Arize cfg = props.getArize();

        boolean credsPresent = cfg.getApiKey() != null && !cfg.getApiKey().isBlank()
                && cfg.getSpaceId() != null && !cfg.getSpaceId().isBlank();

        if (!cfg.isEnabled() || !credsPresent) {
            log.info("Arize OTLP exporter disabled (enabled={}, credsPresent={}). Using no-op tracer.",
                    cfg.isEnabled(), credsPresent);
            return OpenTelemetry.noop();
        }

        // Arize OTLP/HTTP needs space_id + api_key headers and a model_id resource attr.
        OtlpHttpSpanExporter exporter = OtlpHttpSpanExporter.builder()
                .setEndpoint(cfg.getOtlpEndpoint() + "/traces")
                .addHeader("space_id", cfg.getSpaceId())
                .addHeader("api_key", cfg.getApiKey())
                .setTimeout(Duration.ofSeconds(10))
                .build();

        Resource resource = Resource.getDefault().merge(Resource.create(Attributes.builder()
                .put(AttributeKey.stringKey("service.name"), cfg.getProjectName())
                .put(AttributeKey.stringKey("model_id"), cfg.getProjectName())
                .put(AttributeKey.stringKey("model_version"), SERVICE_VERSION)
                .build()));

        sdkTracerProvider = SdkTracerProvider.builder()
                .addSpanProcessor(BatchSpanProcessor.builder(exporter)
                        .setScheduleDelay(Duration.ofSeconds(2))
                        .build())
                .setResource(resource)
                .build();

        log.info("Arize OTLP exporter ENABLED -> {} (project={})",
                cfg.getOtlpEndpoint(), cfg.getProjectName());

        return OpenTelemetrySdk.builder()
                .setTracerProvider(sdkTracerProvider)
                .build();
    }

    @Bean
    public Tracer tracer(OpenTelemetry openTelemetry) {
        return openTelemetry.getTracer(INSTRUMENTATION_NAME, SERVICE_VERSION);
    }

    /** Flush + shut down exporter cleanly so no spans are lost on Ctrl+C. */
    @PreDestroy
    public void shutdown() {
        if (sdkTracerProvider != null) {
            sdkTracerProvider.shutdown().join(5, TimeUnit.SECONDS);
            log.info("Arize OTLP tracer provider shut down.");
        }
    }
}



