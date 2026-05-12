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

class ArizeMcpToolTest {

    private McpClient mcp;
    private ArizeMcpTool tool;

    @BeforeEach
    void setUp() {
        mcp = mock(McpClient.class);
        tool = new ArizeMcpTool(mcp);
    }

    @Test
    void invoke_searchTraces_routesToMcp() {
        ObjectNode result = new ObjectMapper().createObjectNode();
        result.putArray("traces");
        when(mcp.callTool(eq("search_traces"), anyMap())).thenReturn(result);

        Map<String, Object> out = tool.invoke(Map.of(
                "operation", "search_traces",
                "query",     "kharif maize Pune",
                "limit",     5
        ));

        assertThat(out).containsEntry("source", "arize-mcp")
                       .containsEntry("operation", "search_traces");
        verify(mcp).callTool(eq("search_traces"), argThat(args ->
                !args.containsKey("operation")
                        && "kharif maize Pune".equals(args.get("query"))));
    }

    @Test
    void invoke_missingOperation_returnsFallback_withoutCallingMcp() {
        Map<String, Object> out = tool.invoke(Map.of("query", "x"));
        assertThat(out).containsEntry("source", "fallback");
        assertThat(out.get("error")).asString().contains("missing 'operation'");
        verifyNoInteractions(mcp);
    }

    @Test
    void invokeFallback_returnsSafeError() {
        Map<String, Object> out = tool.invokeFallback(
                Map.of("operation", "search_traces"), new RuntimeException("boom"));
        assertThat(out).containsEntry("source", "fallback");
        assertThat(out.get("error")).asString().contains("boom");
    }
}

