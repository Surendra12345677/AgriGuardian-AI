package com.Hackathon.AgriGuardian.AI.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Friendly index page for {@code GET /}. Returns a small JSON pointing judges and
 * developers at the useful entry points (health, OpenAPI, key API surfaces, frontend).
 * Without this, hitting the bare backend host returns a confusing 500.
 */
@RestController
public class RootController {

    @GetMapping("/")
    public Map<String, Object> index() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", "AgriGuardian AI");
        body.put("tagline", "Doubling smallholder farmer income, one season at a time.");
        body.put("status", "ok");
        body.put("docs", "https://github.com/Surendra12345677/AgriGuardian-AI");
        body.put("frontend", "http://localhost:3000");
        Map<String, String> endpoints = new LinkedHashMap<>();
        endpoints.put("health",         "/actuator/health");
        endpoints.put("metrics",        "/actuator/prometheus");
        endpoints.put("openapi",        "/v3/api-docs");
        endpoints.put("swagger-ui",     "/swagger-ui.html");
        endpoints.put("farms",          "/api/v1/farms");
        endpoints.put("recommendation", "POST /api/v1/recommendation");
        endpoints.put("diagnose",       "POST /api/v1/diagnose");
        endpoints.put("tools",          "/api/v1/tools");
        body.put("endpoints", endpoints);
        return body;
    }
}

