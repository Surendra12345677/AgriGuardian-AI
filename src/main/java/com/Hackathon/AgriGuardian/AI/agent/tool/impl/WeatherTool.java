package com.Hackathon.AgriGuardian.AI.agent.tool.impl;

import com.Hackathon.AgriGuardian.AI.agent.tool.AgentTool;
import com.Hackathon.AgriGuardian.AI.config.AgriGuardianProperties;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.github.resilience4j.retry.annotation.Retry;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * Weather tool — calls Open-Meteo via a declarative {@link OpenMeteoClient}
 * (Spring 6 HTTP Interface — the framework-native replacement for OpenFeign).
 *
 * <p>Hardened with industry patterns:</p>
 * <ul>
 *   <li>{@code @CircuitBreaker} — opens after repeated failures so downstream
 *       outages don't pin the agent thread.</li>
 *   <li>{@code @Retry}        — exponential-backoff retry for transient errors.</li>
 *   <li>{@code @Cacheable}    — 15-minute Caffeine cache keyed by lat/lon.</li>
 *   <li>{@code fallbackMethod} — never crashes the agent; returns safe defaults.</li>
 * </ul>
 */
@Slf4j
@Component
public class WeatherTool implements AgentTool {

    private static final String CB_NAME    = "openMeteo";
    private static final String CACHE_NAME = "weather";

    private final AgriGuardianProperties.Weather props;
    private final OpenMeteoClient client;

    public WeatherTool(AgriGuardianProperties properties, OpenMeteoClient client) {
        this.props  = properties.getWeather();
        this.client = client;
    }

    @Override public String name() { return "weather"; }

    @Override public String description() {
        return "Calls Open-Meteo (resilient + cached) and returns a 7-day weather summary "
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
        return fetchForecast(lat, lon);
    }

    /** Hot path — proxied for cache + circuit-breaker + retry. */
    @Cacheable(value = CACHE_NAME, key = "T(java.lang.String).format('%.3f,%.3f', #lat, #lon)")
    @CircuitBreaker(name = CB_NAME, fallbackMethod = "fetchForecastFallback")
    @Retry(name = CB_NAME)
    public Map<String, Object> fetchForecast(double lat, double lon) {
        log.debug("Open-Meteo lookup lat={} lon={}", lat, lon);
        OpenMeteoClient.OpenMeteoResponse resp = client.getForecast(
                lat, lon,
                "temperature_2m_max,temperature_2m_min,precipitation_sum,relative_humidity_2m_mean",
                props.getForecastDays(),
                "auto"
        );
        if (resp == null || resp.daily() == null) {
            return fallback("empty-response");
        }
        return summarize(resp.daily());
    }

    /** Resilience4j fallback — original args + thrown exception. */
    @SuppressWarnings("unused")
    public Map<String, Object> fetchForecastFallback(double lat, double lon, Throwable t) {
        log.warn("Open-Meteo unavailable ({}): returning fallback for lat={} lon={}",
                t.getClass().getSimpleName(), lat, lon);
        return fallback("circuit-open-or-error");
    }

    private Map<String, Object> summarize(OpenMeteoClient.Daily d) {
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
}

