package com.Hackathon.AgriGuardian.AI.observability;

import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.api.trace.Tracer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Provides a no-op {@link Tracer} so that span-emitting code paths
 * (e.g. {@code AgentOrchestrator}) keep working without any external
 * tracing backend.
 *
 * <p>The original Arize OTLP exporter was removed because Arize is a
 * <em>different</em> partner-track from the one we submit to (MongoDB).
 * Internal trace ids are still useful for log correlation.</p>
 */
@Configuration
public class OpenTelemetryConfig {

    private static final String INSTRUMENTATION_NAME = "agriguardian.agent";
    private static final String SERVICE_VERSION = "0.1.0";

    @Bean
    public OpenTelemetry openTelemetry() {
        return OpenTelemetry.noop();
    }

    @Bean
    public Tracer tracer(OpenTelemetry openTelemetry) {
        return openTelemetry.getTracer(INSTRUMENTATION_NAME, SERVICE_VERSION);
    }
}



