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
 * Agent tool that gives the AI <strong>super-powers over MongoDB</strong> via the
 * official <a href="https://github.com/mongodb-labs/mongodb-mcp-server">MongoDB
 * MCP server</a>.
 *
 * <p>This is the partner-track qualifier for the hackathon: the agent moves
 * beyond chat — it can <em>plan</em>, then <em>act</em> on the farmer's database
 * (read farm history, persist new tasks, mark tasks done) under human oversight.</p>
 *
 * <p>The tool takes a single {@code operation} arg plus operation-specific
 * params. Routes to the matching MCP tool name on the MongoDB MCP server:
 * <pre>{@code
 * { "operation": "find",        "database": "agriguardian", "collection": "farms",   "filter": { "ownerId": "u-1" } }
 * { "operation": "aggregate",   "database": "agriguardian", "collection": "tasks",   "pipeline": [ ... ] }
 * { "operation": "update-many", "database": "agriguardian", "collection": "tasks",   "filter": {...}, "update": {...} }
 * { "operation": "insert-one",  "database": "agriguardian", "collection": "tasks",   "document": {...} }
 * { "operation": "list-collections", "database": "agriguardian" }
 * }</pre>
 */
@Slf4j
@Component
@ConditionalOnBean(name = "mongoMcpClient")
public class MongoMcpTool implements AgentTool {

    private static final String CB_NAME = "mongoMcp";

    private final McpClient mcp;

    public MongoMcpTool(@Qualifier("mongoMcpClient") McpClient mcp) {
        this.mcp = mcp;
    }

    @Override public String name() { return "mongo.mcp"; }

    @Override public String description() {
        return "Reads or mutates the farm database via MongoDB MCP. "
                + "Args: { operation: find|aggregate|update-many|insert-one|list-collections, "
                + "database, collection, ...op-specific }";
    }

    @Override
    @CircuitBreaker(name = CB_NAME, fallbackMethod = "invokeFallback")
    @Retry(name = CB_NAME)
    public Map<String, Object> invoke(Map<String, Object> args) {
        String op = String.valueOf(args.getOrDefault("operation", "")).trim();
        if (op.isEmpty()) {
            return error("missing 'operation' arg — see tool description");
        }

        Map<String, Object> mcpArgs = new LinkedHashMap<>(args);
        mcpArgs.remove("operation");

        log.info("[mongo.mcp] calling {} on MongoDB MCP server with args.keys={}",
                op, mcpArgs.keySet());

        JsonNode result = mcp.callTool(op, mcpArgs);
        return Map.of(
                "operation", op,
                "source",    "mongodb-mcp",
                "result",    result == null ? "" : result.toString()
        );
    }

    @SuppressWarnings("unused")
    public Map<String, Object> invokeFallback(Map<String, Object> args, Throwable t) {
        log.warn("MongoDB MCP unavailable ({}): returning fallback", t.getClass().getSimpleName());
        return error("mongodb-mcp-unavailable: " + t.getMessage());
    }

    private static Map<String, Object> error(String message) {
        return Map.of(
                "source",  "fallback",
                "error",   message,
                "result",  ""
        );
    }
}

