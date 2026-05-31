package com.Hackathon.AgriGuardian.AI.api;

import com.Hackathon.AgriGuardian.AI.config.AgriGuardianProperties;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Exposes a live snapshot of the Arize OTLP + MCP configuration so the
 * dashboard can show a "connected / disabled" badge without hardcoding
 * credentials in the frontend.
 *
 * <p>Only metadata is exposed — API keys and space IDs are never revealed.</p>
 */
@RestController
@RequestMapping("/api/v1/arize")
public class ArizeStatusController {

    private final AgriGuardianProperties props;

    public ArizeStatusController(AgriGuardianProperties props) {
        this.props = props;
    }

    @GetMapping("/status")
    public Map<String, Object> status() {
        AgriGuardianProperties.Arize arize = props.getArize();
        AgriGuardianProperties.Mcp.ArizeMcp mcp = props.getMcp().getArize();

        boolean exporterEnabled = arize.isEnabled()
                && arize.getApiKey() != null && !arize.getApiKey().isBlank()
                && arize.getSpaceId() != null && !arize.getSpaceId().isBlank();
        boolean mcpEnabled = mcp.isEnabled()
                && mcp.getApiKey() != null && !mcp.getApiKey().isBlank();

        // Redact actual key values — only expose a masked hint.
        String spaceHint = masked(arize.getSpaceId());

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("exporterEnabled",  exporterEnabled);
        out.put("mcpEnabled",       mcpEnabled);
        out.put("projectName",      arize.getProjectName());
        out.put("otlpEndpoint",     arize.getOtlpEndpoint());
        out.put("spaceIdHint",      spaceHint);
        // batchDelay in ms — useful for the dashboard to show "spans export every N ms"
        out.put("batchDelayMs",     500);
        return out;
    }

    private static String masked(String s) {
        if (s == null || s.isBlank()) return "";
        return s.length() > 4 ? s.substring(0, 4) + "…" : "…";
    }
}

