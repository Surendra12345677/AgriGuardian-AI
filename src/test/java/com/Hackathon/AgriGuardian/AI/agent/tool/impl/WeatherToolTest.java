package com.Hackathon.AgriGuardian.AI.agent.tool.impl;

import com.Hackathon.AgriGuardian.AI.config.AgriGuardianProperties;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import org.springframework.http.HttpMethod;

class WeatherToolTest {

    private WeatherTool tool;
    private MockRestServiceServer server;

    @BeforeEach
    void setUp() {
        AgriGuardianProperties props = new AgriGuardianProperties();
        props.getWeather().setBaseUrl("https://api.open-meteo.com/v1");

        RestClient.Builder builder = RestClient.builder();
        // Bind a mock server to this builder before WeatherTool builds the client.
        server = MockRestServiceServer.bindTo(builder).build();
        tool = new WeatherTool(props, builder);
    }

    @AfterEach
    void tearDown() {
        server.verify();
    }

    @Test
    void invoke_validResponse_summarizesDailyArrays() {
        String json = """
                { "daily": {
                    "temperature_2m_max":        [30.0, 31.0, 32.0],
                    "temperature_2m_min":        [20.0, 21.0, 22.0],
                    "precipitation_sum":         [ 1.0,  2.5,  0.0],
                    "relative_humidity_2m_mean": [60.0, 70.0, 65.0]
                }}
                """;
        server.expect(method(HttpMethod.GET))
              .andRespond(withSuccess(json, MediaType.APPLICATION_JSON));

        Map<String, Object> out = tool.invoke(Map.of("latitude", 18.52, "longitude", 73.85));

        assertThat(out).containsEntry("source", "open-meteo");
        assertThat((Double) out.get("tempMaxC")).isEqualTo(31.0);
        assertThat((Double) out.get("tempMinC")).isEqualTo(21.0);
        assertThat((Double) out.get("rainfallMmNext7d")).isEqualTo(3.5);
        assertThat((Double) out.get("humidity")).isEqualTo(0.65);
    }

    @Test
    void invoke_missingCoords_returnsFallback() {
        // No HTTP call expected.
        Map<String, Object> out = tool.invoke(Map.of());
        assertThat(out).containsEntry("source", "fallback")
                       .containsEntry("reason", "missing-coords");
    }

    @Test
    void invoke_serverError_returnsFallback() {
        server.expect(requestTo(org.hamcrest.Matchers.startsWith("https://api.open-meteo.com/v1/forecast")))
              .andRespond(withServerError());

        Map<String, Object> out = tool.invoke(Map.of("latitude", 18.52, "longitude", 73.85));
        assertThat(out).containsEntry("source", "fallback")
                       .containsEntry("reason", "network-error");
    }
}

