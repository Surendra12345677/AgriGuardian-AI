package com.Hackathon.AgriGuardian.AI.api;

import com.Hackathon.AgriGuardian.AI.agent.tool.AgentTool;
import com.Hackathon.AgriGuardian.AI.agent.tool.ToolRegistry;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;

/**
 * <strong>Tool-backend endpoints for Google Cloud Agent Builder.</strong>
 *
 * <p>The agent defined in {@code agent-builder/agriguardian-agent.yaml} calls
 * these endpoints as its HTTP tools. Each endpoint is a thin wrapper around
 * an {@link AgentTool} implementation, so the same tools work in two modes:
 * <ol>
 *   <li><b>Remote</b> (production) — Agent Builder &rarr; this REST API.</li>
 *   <li><b>Local</b> (dev / fallback) — our own {@code AgentOrchestrator}
 *       calls the tools in-process.</li>
 * </ol>
 *
 * <p>All endpoints accept a flat JSON object as input and return the tool's
 * output as a JSON object — exactly the shape Agent Builder expects.</p>
 */
@RestController
@RequestMapping("/api/v1/tools")
@Tag(name = "Agent Tools",
     description = "HTTP tool endpoints invoked by Google Cloud Agent Builder.")
public class ToolController {

    private static final Logger log = LoggerFactory.getLogger(ToolController.class);

    private final ToolRegistry tools;

    public ToolController(ToolRegistry tools) {
        this.tools = tools;
    }

    @GetMapping
    @Operation(summary = "List all available agent tools and their descriptions.")
    public Map<String, String> listTools() {
        Map<String, String> out = new LinkedHashMap<>();
        tools.all().forEach((name, tool) -> out.put(name, tool.description()));
        return out;
    }

    @PostMapping("/weather")
    @Operation(summary = "7-day weather summary for a lat/lon (Open-Meteo, cached + resilient).")
    public ResponseEntity<Map<String, Object>> weather(@RequestBody Map<String, Object> body) {
        return invoke("weather", body);
    }

    @PostMapping("/market")
    @Operation(summary = "Indicative crop price (INR/quintal) + seasonal trend + sell window.")
    public ResponseEntity<Map<String, Object>> market(@RequestBody Map<String, Object> body) {
        return invoke("market", body);
    }

    @PostMapping("/soil")
    @Operation(summary = "Soil knowledge-base lookup for a lat/lon.")
    public ResponseEntity<Map<String, Object>> soil(@RequestBody Map<String, Object> body) {
        return invoke("soil", body);
    }

    @PostMapping("/mongo")
    @Operation(summary = "Read/mutate the farm database via MongoDB MCP (partner integration).")
    public ResponseEntity<Map<String, Object>> mongo(@RequestBody Map<String, Object> body) {
        return invoke("mongo.mcp", body);
    }

    /**
     * Generic dispatcher: lets Agent Builder address any registered tool by
     * name via a single endpoint. Useful when adding new tools without
     * redeploying.
     */
    @PostMapping("/{name}")
    @Operation(summary = "Generic dispatcher — invokes any registered tool by name.")
    public ResponseEntity<Map<String, Object>> dispatch(
            @Parameter(description = "Tool name (e.g. weather, market, soil, mongo.mcp)")
            @PathVariable String name,
            @RequestBody Map<String, Object> body) {
        return invoke(name, body);
    }

    /* ── internals ──────────────────────────────────────────────────── */

    private static final Set<String> NAMED_ENDPOINTS =
            Set.of("weather", "market", "soil", "mongo");

    private ResponseEntity<Map<String, Object>> invoke(String name, Map<String, Object> body) {
        AgentTool tool = tools.all().get(name);
        if (tool == null) {
            throw new NoSuchElementException("Unknown agent tool: " + name);
        }
        log.info("[tools/{}] invoke args.keys={}", name,
                body == null ? "[]" : body.keySet());
        Map<String, Object> result = tool.invoke(body == null ? Map.of() : body);
        return ResponseEntity.ok(result);
    }
}

