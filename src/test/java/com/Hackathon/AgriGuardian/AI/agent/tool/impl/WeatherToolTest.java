package com.Hackathon.AgriGuardian.AI.agent.tool.impl;

import com.Hackathon.AgriGuardian.AI.config.AgriGuardianProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Unit-tests the {@link WeatherTool} by mocking the declarative
 * {@link OpenMeteoClient}. Resilience4j and Caffeine annotations are no-ops
 * here because we instantiate the tool directly (no Spring proxy) — this is
 * intentional: those concerns are covered by their own well-tested libraries.
 */
class WeatherToolTest {

    private OpenMeteoClient client;
    private WeatherTool tool;

    @BeforeEach
    void setUp() {
        client = mock(OpenMeteoClient.class);
        AgriGuardianProperties props = new AgriGuardianProperties();
        tool = new WeatherTool(props, client);
    }

    @Test
    void invoke_validResponse_summarizesDailyArrays() {
        when(client.getForecast(anyDouble(), anyDouble(), anyString(), anyInt(), anyString()))
                .thenReturn(new OpenMeteoClient.OpenMeteoResponse(new OpenMeteoClient.Daily(
                        List.of(30.0, 31.0, 32.0),
                        List.of(20.0, 21.0, 22.0),
                        List.of( 1.0,  2.5,  0.0),
                        List.of(60.0, 70.0, 65.0)
                )));

        Map<String, Object> out = tool.invoke(Map.of("latitude", 18.52, "longitude", 73.85));

        assertThat(out).containsEntry("source", "open-meteo");
        assertThat((Double) out.get("tempMaxC")).isEqualTo(31.0);
        assertThat((Double) out.get("tempMinC")).isEqualTo(21.0);
        assertThat((Double) out.get("rainfallMmNext7d")).isEqualTo(3.5);
        assertThat((Double) out.get("humidity")).isEqualTo(0.65);
    }

    @Test
    void invoke_missingCoords_returnsFallback_andSkipsHttp() {
        Map<String, Object> out = tool.invoke(Map.of());
        assertThat(out).containsEntry("source", "fallback")
                       .containsEntry("reason", "missing-coords");
        verifyNoInteractions(client);
    }

    @Test
    void fetchForecastFallback_returnsSafeDefaults() {
        Map<String, Object> out = tool.fetchForecastFallback(
                18.52, 73.85, new RuntimeException("boom"));
        assertThat(out).containsEntry("source", "fallback")
                       .containsEntry("reason", "circuit-open-or-error");
    }
}

