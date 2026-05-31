package com.Hackathon.AgriGuardian.AI.api;

import com.Hackathon.AgriGuardian.AI.config.AgriGuardianProperties;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Exposes a live snapshot of the Arize OTLP + MCP configuration so the
 * dashboard can show a "connected / disabled" badge without hardcoding
 * credentials in the frontend.
 *
 * <p>Only metadata is exposed — API keys are never revealed.
 * The spaceId is a base64-encoded string like {@code Space:44292:xGDX}
 * — we decode it to extract the numeric org ID needed to build the
 * Arize console URL (app.arize.com/organizations/{orgId}).</p>
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

        // Decode the base64 spaceId to extract the numeric org ID for the Arize URL.
        // Format after decode: "Space:ORGID:SPACESHORTNAME"
        String orgId = extractOrgId(arize.getSpaceId());
        String spaceHint = masked(arize.getSpaceId());

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("exporterEnabled",  exporterEnabled);
        out.put("mcpEnabled",       mcpEnabled);
        out.put("projectName",      arize.getProjectName());
        out.put("otlpEndpoint",     arize.getOtlpEndpoint());
        out.put("spaceIdHint",      spaceHint);
        // Numeric org ID for building app.arize.com/organizations/{orgId}/... URLs
        out.put("arizeOrgId",       orgId);
        out.put("batchDelayMs",     500);
        return out;
    }

    /**
     * Decodes a base64-encoded Arize space ID and returns the numeric org ID.
     * Example: base64("Space:44292:xGDX") → "44292"
     */
    static String extractOrgId(String spaceId) {
        if (spaceId == null || spaceId.isBlank()) return "";
        try {
            String decoded = new String(Base64.getDecoder().decode(spaceId.trim()));
            // decoded format: "Space:ORGID:SHORTNAME"
            String[] parts = decoded.split(":");
            if (parts.length >= 2) return parts[1];
        } catch (Exception ignored) { /* not base64 — return as-is */ }
        return spaceId;
    }

    private static String masked(String s) {
        if (s == null || s.isBlank()) return "";
        return s.length() > 4 ? s.substring(0, 4) + "…" : "…";
    }
}

