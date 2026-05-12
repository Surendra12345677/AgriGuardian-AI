package com.Hackathon.AgriGuardian.AI.agent.tool.impl;

import com.Hackathon.AgriGuardian.AI.agent.tool.AgentTool;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * Stub weather tool. TODO: replace with Open-Meteo call once we wire RestClient
 * (lat/lon already accepted in args).
 */
@Component
public class WeatherTool implements AgentTool {
    @Override public String name() { return "weather"; }

    @Override public String description() {
        return "Returns 7-day weather summary (temperature C, rainfall mm, humidity 0..1) for a lat/lon.";
    }

    @Override public Map<String, Object> invoke(Map<String, Object> args) {
        return Map.of(
                "tempC", 28.5,
                "rainfallMmNext7d", 12.0,
                "humidity", 0.62
        );
    }
}

