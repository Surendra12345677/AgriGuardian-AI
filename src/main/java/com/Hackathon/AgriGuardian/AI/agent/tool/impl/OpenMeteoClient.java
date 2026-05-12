package com.Hackathon.AgriGuardian.AI.agent.tool.impl;

import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.service.annotation.GetExchange;

import java.util.List;

/**
 * Declarative HTTP client for the Open-Meteo forecast API.
 *
 * <p>Uses Spring 6's {@code @HttpExchange} (the modern, framework-native
 * replacement for Spring Cloud OpenFeign — no Spring Cloud dependency required).</p>
 *
 * <p>Wired in {@link com.Hackathon.AgriGuardian.AI.config.HttpClientConfig}.</p>
 */
public interface OpenMeteoClient {

    @GetExchange("/forecast")
    OpenMeteoResponse getForecast(
            @RequestParam("latitude")     double latitude,
            @RequestParam("longitude")    double longitude,
            @RequestParam("daily")        String dailyFields,
            @RequestParam("forecast_days") int forecastDays,
            @RequestParam("timezone")     String timezone
    );

    /* ── DTOs (records — Jackson uses field names) ── */
    record OpenMeteoResponse(Daily daily) { }

    record Daily(
            List<Double> temperature_2m_max,
            List<Double> temperature_2m_min,
            List<Double> precipitation_sum,
            List<Double> relative_humidity_2m_mean
    ) { }
}

