package com.Hackathon.AgriGuardian.AI.agent.tool;

import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.stream.Collectors;

/** Aggregates all {@link AgentTool} beans and exposes name-based lookup. */
@Component
public class ToolRegistry {

    private final Map<String, AgentTool> tools;

    public ToolRegistry(List<AgentTool> agentTools) {
        this.tools = Collections.unmodifiableMap(
                agentTools.stream().collect(Collectors.toMap(AgentTool::name, t -> t)));
    }

    public AgentTool require(String name) {
        AgentTool t = tools.get(name);
        if (t == null) {
            throw new NoSuchElementException("Unknown agent tool: " + name);
        }
        return t;
    }

    public Map<String, AgentTool> all() {
        return tools;
    }
}

