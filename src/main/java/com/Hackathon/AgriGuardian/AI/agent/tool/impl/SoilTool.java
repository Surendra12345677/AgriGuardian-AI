package com.Hackathon.AgriGuardian.AI.agent.tool.impl;

import com.Hackathon.AgriGuardian.AI.agent.tool.AgentTool;
import org.springframework.stereotype.Component;

import java.util.Map;

/** Stub soil knowledge-base tool. TODO: lookup via SoilGrids / national soil API. */
@Component
public class SoilTool implements AgentTool {
    @Override public String name() { return "soil"; }

    @Override public String description() {
        return "Returns soil composition (type, pH, macro-nutrient level) for a lat/lon.";
    }

    @Override public Map<String, Object> invoke(Map<String, Object> args) {
        return Map.of(
                "type", "loam",
                "ph", 6.7,
                "nitrogen", "medium"
        );
    }
}

