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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

/**
 * Wires an {@link OpenTelemetry} pipeline.
 *
 * <p>When Arize is enabled <em>and</em> credentials are present, spans are
 * batched and sent to Arize via OTLP/HTTP. Otherwise a no-op {@link OpenTelemetry}
 * is registered so injected {@link Tracer} usage stays harmless.
 */
@Configuration
public class OpenTelemetryConfig {

    private static final Logger log = LoggerFactory.getLogger(OpenTelemetryConfig.class);
    private static final String INSTRUMENTATION_NAME = "agriguardian.agent";
    private static final String SERVICE_VERSION = "0.1.0";

    @Bean
    public OpenTelemetry openTelemetry(AgriGuardianProperties props) {
        AgriGuardianProperties.Arize arize = props.getArize();
        boolean exporterReady = arize.isEnabled()
                && arize.getApiKey() != null && !arize.getApiKey().isBlank()
                && arize.getSpaceId() != null && !arize.getSpaceId().isBlank();

        if (!exporterReady) {
            log.info("Arize OTLP exporter disabled (enabled={}, hasKey={}, hasSpace={}). Using no-op OpenTelemetry.",
                    arize.isEnabled(),
                    arize.getApiKey() != null && !arize.getApiKey().isBlank(),
                    arize.getSpaceId() != null && !arize.getSpaceId().isBlank());
            return OpenTelemetry.noop();
        }

        Resource resource = Resource.getDefault().merge(Resource.create(Attributes.builder()
                .put(AttributeKey.stringKey("service.name"), "agriguardian-ai")
                .put(AttributeKey.stringKey("service.version"), SERVICE_VERSION)
                .put(AttributeKey.stringKey("model_id"), "agriguardian-agent")
                .put(AttributeKey.stringKey("space_id"), arize.getSpaceId())
                .put(AttributeKey.stringKey("project_name"), arize.getProjectName())
                .build()));

        OtlpHttpSpanExporter exporter = OtlpHttpSpanExporter.builder()
                .setEndpoint(arize.getOtlpEndpoint())
                .addHeader("space_id", arize.getSpaceId())
                .addHeader("api_key", arize.getApiKey())
                .setTimeout(Duration.ofSeconds(10))
                .build();

        SdkTracerProvider tracerProvider = SdkTracerProvider.builder()
                .addSpanProcessor(BatchSpanProcessor.builder(exporter).build())
                .setResource(resource)
                .build();

        log.info("Arize OTLP exporter enabled → endpoint={}", arize.getOtlpEndpoint());
        return OpenTelemetrySdk.builder().setTracerProvider(tracerProvider).build();
    }

    @Bean
    public Tracer tracer(OpenTelemetry openTelemetry) {
        return openTelemetry.getTracer(INSTRUMENTATION_NAME, SERVICE_VERSION);
    }
}

