package com.Hackathon.AgriGuardian.AI.agent.tool.impl;

import com.Hackathon.AgriGuardian.AI.agent.tool.AgentTool;
import com.Hackathon.AgriGuardian.AI.mcp.McpClient;
import com.fasterxml.jackson.databind.JsonNode;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.github.resilience4j.retry.annotation.Retry;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Agent tool exposing the <strong>Arize MCP server</strong> — the hackathon
 * partner-track qualifier.
 *
 * <p>The agent uses this tool to:
 * <ul>
 *   <li>look up similar past runs and their evaluation scores before answering;</li>
 *   <li>fetch hallucination / accuracy metrics for its own previous outputs;</li>
 *   <li>log feedback so future runs improve.</li>
 * </ul>
 *
 * <p>Args shape:
 * <pre>
 * { "operation": "search_traces" | "get_evaluations" | "log_feedback" | ...,
 *   ...operation-specific fields }
 * </pre>
 * The {@code operation} is forwarded as the MCP tool name; everything else
 * becomes the tool's {@code arguments} payload.</p>
 */
@Slf4j
@Component
@ConditionalOnBean(name = "arizeMcpClient")
public class ArizeMcpTool implements AgentTool {

    private static final String CB_NAME = "arizeMcp";

    private final McpClient mcp;

    public ArizeMcpTool(@Qualifier("arizeMcpClient") McpClient mcp) {
        this.mcp = mcp;
    }

    @Override public String name() { return "arize.mcp"; }

    @Override public String description() {
        return "Queries Arize MCP for past-run insights and logs feedback. "
                + "Args: { operation: search_traces|get_evaluations|log_feedback|..., ...op-specific }";
    }

    @Override
    @CircuitBreaker(name = CB_NAME, fallbackMethod = "invokeFallback")
    @Retry(name = CB_NAME)
    public Map<String, Object> invoke(Map<String, Object> args) {
        String op = String.valueOf(args.getOrDefault("operation", "")).trim();
        if (op.isEmpty()) {
            return error("missing 'operation' arg");
        }
        Map<String, Object> mcpArgs = new LinkedHashMap<>(args);
        mcpArgs.remove("operation");

        log.info("[arize.mcp] calling {} with args.keys={}", op, mcpArgs.keySet());
        JsonNode result = mcp.callTool(op, mcpArgs);
        return Map.of(
                "operation", op,
                "source",    "arize-mcp",
                "result",    result == null ? "" : result.toString()
        );
    }

    @SuppressWarnings("unused")
    public Map<String, Object> invokeFallback(Map<String, Object> args, Throwable t) {
        log.warn("Arize MCP unavailable ({}): returning fallback", t.getClass().getSimpleName());
        return error("arize-mcp-unavailable: " + t.getMessage());
    }

    private static Map<String, Object> error(String message) {
        return Map.of("source", "fallback", "error", message, "result", "");
    }
}

