package com.Hackathon.AgriGuardian.AI.mcp;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Minimal <strong>Model Context Protocol</strong> client speaking JSON-RPC 2.0
 * over HTTP (Streamable-HTTP transport).
 *
 * <p>MCP — introduced by Anthropic and adopted by Google, OpenAI, MongoDB, Arize,
 * Elastic, Fivetran and GitLab — lets agents talk to external "servers" in a
 * standard way. The hackathon requires a meaningful integration with one
 * partner's MCP server; we target <strong>MongoDB MCP</strong>.</p>
 *
 * <p>This client is intentionally tiny:
 * <ol>
 *   <li>{@link #initialize()} — performs the MCP handshake.</li>
 *   <li>{@link #listTools()} — enumerates the tools the server exposes.</li>
 *   <li>{@link #callTool(String, Map)} — invokes a tool with arguments.</li>
 * </ol>
 * <p>Errors are surfaced as {@link McpException} so the agent can decide
 * whether to retry, fallback, or fail the run.</p>
 */
@Slf4j
public class McpClient {

    private final RestClient http;
    private final ObjectMapper mapper;
    private final String serverName;

    public McpClient(String baseUrl, String serverName, RestClient.Builder builder) {
        this.serverName = serverName;
        this.http = builder.baseUrl(baseUrl).build();
        this.mapper = new ObjectMapper();
    }

    /** Performs the MCP handshake. Call once at startup before {@link #callTool}. */
    public JsonNode initialize() {
        return rpc("initialize", Map.of(
                "protocolVersion", "2025-06-18",
                "capabilities", Map.of("tools", Map.of()),
                "clientInfo", Map.of(
                        "name", "agriguardian-ai",
                        "version", "0.1.0"
                )
        ));
    }

    /** Returns the JSON array of tool descriptors exposed by the server. */
    public JsonNode listTools() {
        return rpc("tools/list", Map.of());
    }

    /**
     * Invokes a tool on the MCP server.
     * @param toolName  e.g. {@code "find"}, {@code "aggregate"}, {@code "update-many"}
     * @param arguments tool-specific args (e.g. {@code {database, collection, filter}})
     */
    public JsonNode callTool(String toolName, Map<String, Object> arguments) {
        return rpc("tools/call", Map.of(
                "name", toolName,
                "arguments", arguments
        ));
    }

    /* ── internals ───────────────────────────────────────────────────── */

    private JsonNode rpc(String method, Map<String, Object> params) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("jsonrpc", "2.0");
        payload.put("id", UUID.randomUUID().toString());
        payload.put("method", method);
        payload.put("params", params);

        try {
            JsonNode response = http.post()
                    .uri("")
                    .contentType(MediaType.APPLICATION_JSON)
                    .accept(MediaType.APPLICATION_JSON, MediaType.parseMediaType("text/event-stream"))
                    .body(payload)
                    .retrieve()
                    .body(JsonNode.class);

            if (response == null) {
                throw new McpException("Empty response from " + serverName + "/" + method);
            }
            if (response.has("error")) {
                JsonNode err = response.get("error");
                throw new McpException("MCP error " + err.path("code").asInt()
                        + " from " + serverName + "/" + method
                        + ": " + err.path("message").asText());
            }
            return response.path("result");
        } catch (McpException e) {
            throw e;
        } catch (Exception e) {
            log.warn("MCP transport error on {} / {}: {}", serverName, method, e.getMessage());
            throw new McpException("Transport failure calling " + serverName + "/" + method, e);
        }
    }

    /** Wrapped failure from any MCP call. */
    public static class McpException extends RuntimeException {
        public McpException(String message) { super(message); }
        public McpException(String message, Throwable cause) { super(message, cause); }
    }
}

