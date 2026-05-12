package com.Hackathon.AgriGuardian.AI.agent.tool.impl;

import com.Hackathon.AgriGuardian.AI.agent.tool.AgentTool;
import com.Hackathon.AgriGuardian.AI.config.AgriGuardianProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.List;
import java.util.Map;

/**
 * Real weather tool — calls the free Open-Meteo forecast API.
 * <p>Args: {@code latitude} (double, required), {@code longitude} (double, required).</p>
 * <p>Returns aggregated 7-day metrics ready to feed into the planner / Gemini.</p>
 * <p>Falls back to safe defaults on any network or parsing failure so the agent
 * never crashes; the failure is logged and signalled via {@code "source":"fallback"}.</p>
 */
@Slf4j
@Component
public class WeatherTool implements AgentTool {

    private final AgriGuardianProperties.Weather props;
    private final RestClient http;

    public WeatherTool(AgriGuardianProperties properties, RestClient.Builder builder) {
        this.props = properties.getWeather();
        this.http = (builder == null ? RestClient.builder() : builder)
                .baseUrl(props.getBaseUrl())
                .build();
    }

    @Override public String name() { return "weather"; }

    @Override public String description() {
        return "Calls Open-Meteo and returns a 7-day weather summary "
                + "(avg/max/min temperature C, total rainfall mm, mean humidity 0..1) for a lat/lon.";
    }

    @Override
    public Map<String, Object> invoke(Map<String, Object> args) {
        double lat = asDouble(args.get("latitude"), Double.NaN);
        double lon = asDouble(args.get("longitude"), Double.NaN);
        if (Double.isNaN(lat) || Double.isNaN(lon)) {
            log.warn("weather tool called without latitude/longitude — returning fallback");
            return fallback("missing-coords");
        }

        try {
            OpenMeteoResponse resp = http.get()
                    .uri(uri -> uri.path("/forecast")
                            .queryParam("latitude", lat)
                            .queryParam("longitude", lon)
                            .queryParam("daily", "temperature_2m_max,temperature_2m_min,"
                                    + "precipitation_sum,relative_humidity_2m_mean")
                            .queryParam("forecast_days", props.getForecastDays())
                            .queryParam("timezone", "auto")
                            .build())
                    .retrieve()
                    .body(OpenMeteoResponse.class);

            if (resp == null || resp.daily() == null) {
                return fallback("empty-response");
            }
            return summarize(resp.daily());
        } catch (RestClientException e) {
            log.warn("Open-Meteo call failed: {} — returning fallback", e.getMessage());
            return fallback("network-error");
        }
    }

    private Map<String, Object> summarize(Daily d) {
        double tMax = avg(d.temperature_2m_max());
        double tMin = avg(d.temperature_2m_min());
        double rain = sum(d.precipitation_sum());
        double hum  = avg(d.relative_humidity_2m_mean()) / 100.0;
        return Map.of(
                "tempMaxC",         round(tMax),
                "tempMinC",         round(tMin),
                "tempAvgC",         round((tMax + tMin) / 2.0),
                "rainfallMmNext7d", round(rain),
                "humidity",         round(hum),
                "forecastDays",     props.getForecastDays(),
                "source",           "open-meteo"
        );
    }

    private static Map<String, Object> fallback(String reason) {
        return Map.of(
                "tempAvgC",         28.0,
                "tempMaxC",         33.0,
                "tempMinC",         23.0,
                "rainfallMmNext7d", 12.0,
                "humidity",         0.62,
                "forecastDays",     7,
                "source",           "fallback",
                "reason",           reason
        );
    }

    private static double asDouble(Object o, double def) {
        if (o instanceof Number n) return n.doubleValue();
        if (o instanceof String s) try { return Double.parseDouble(s); } catch (NumberFormatException ignored) { }
        return def;
    }

    private static double avg(List<Double> xs) {
        if (xs == null || xs.isEmpty()) return 0.0;
        double s = 0; int n = 0;
        for (Double x : xs) if (x != null) { s += x; n++; }
        return n == 0 ? 0.0 : s / n;
    }

    private static double sum(List<Double> xs) {
        if (xs == null) return 0.0;
        double s = 0;
        for (Double x : xs) if (x != null) s += x;
        return s;
    }

    private static double round(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    /* ── Open-Meteo response DTOs (records — Jackson uses field names) ── */
    public record OpenMeteoResponse(Daily daily) { }
    public record Daily(
            List<Double> temperature_2m_max,
            List<Double> temperature_2m_min,
            List<Double> precipitation_sum,
            List<Double> relative_humidity_2m_mean
    ) { }
}

