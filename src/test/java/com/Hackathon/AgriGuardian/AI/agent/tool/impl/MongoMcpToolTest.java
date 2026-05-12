package com.Hackathon.AgriGuardian.AI.agent.tool.impl;

import com.Hackathon.AgriGuardian.AI.mcp.McpClient;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class MongoMcpToolTest {

    private McpClient mcp;
    private MongoMcpTool tool;

    @BeforeEach
    void setUp() {
        mcp = mock(McpClient.class);
        tool = new MongoMcpTool(mcp);
    }

    @Test
    void invoke_routesOperationToMcp_andReturnsResult() {
        ObjectNode result = new ObjectMapper().createObjectNode();
        result.putArray("documents");
        when(mcp.callTool(eq("find"), anyMap())).thenReturn(result);

        Map<String, Object> out = tool.invoke(Map.of(
                "operation",  "find",
                "database",   "agriguardian",
                "collection", "farms",
                "filter",     Map.of("ownerId", "u-1")
        ));

        assertThat(out).containsEntry("source", "mongodb-mcp")
                       .containsEntry("operation", "find");
        verify(mcp).callTool(eq("find"), argThat(args ->
                !args.containsKey("operation")
                        && "agriguardian".equals(args.get("database"))
                        && "farms".equals(args.get("collection"))));
    }

    @Test
    void invoke_missingOperation_returnsErrorFallback_withoutCallingMcp() {
        Map<String, Object> out = tool.invoke(Map.of("database", "agriguardian"));
        assertThat(out).containsEntry("source", "fallback");
        assertThat(out.get("error")).asString().contains("missing 'operation'");
        verifyNoInteractions(mcp);
    }

    @Test
    void invokeFallback_returnsSafeError() {
        Map<String, Object> out = tool.invokeFallback(
                Map.of("operation", "find"), new RuntimeException("boom"));
        assertThat(out).containsEntry("source", "fallback");
        assertThat(out.get("error")).asString().contains("boom");
    }
}

