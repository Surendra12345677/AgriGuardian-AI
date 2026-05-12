package com.Hackathon.AgriGuardian.AI.agent.tool;

import java.util.Map;

/** Contract every agent-callable tool implements. */
public interface AgentTool {
    /** Stable, lowercase, dotted name used by the planner (e.g. {@code "weather"}). */
    String name();

    /** Short human-readable description; surfaced in planner prompts. */
    String description();

    /** Execute the tool. Implementations must be deterministic for given args. */
    Map<String, Object> invoke(Map<String, Object> args);
}

