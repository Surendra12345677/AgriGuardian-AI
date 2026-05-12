package com.Hackathon.AgriGuardian.AI.agent.tool.impl;

import com.Hackathon.AgriGuardian.AI.agent.tool.AgentTool;
import org.springframework.stereotype.Component;

import java.util.Map;

/** Stub market-price tool. TODO: integrate AGMARKNET / Mandi API. */
@Component
public class MarketPriceTool implements AgentTool {
    @Override public String name() { return "market"; }

    @Override public String description() {
        return "Returns the current price per quintal and short-term trend for a crop.";
    }

    @Override public Map<String, Object> invoke(Map<String, Object> args) {
        Object crop = args.getOrDefault("crop", "unknown");
        return Map.of(
                "crop", crop,
                "pricePerQuintal", 2350,
                "trend", "rising"
        );
    }
}

