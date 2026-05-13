package com.Hackathon.AgriGuardian.AI.ai;

import com.Hackathon.AgriGuardian.AI.config.AgriGuardianProperties;
import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.Tracer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.util.List;
import java.util.Map;

/**
 * Real Gemini implementation using Spring {@link RestClient}. Kept intentionally
 * small — production hardening (retries, structured output, function calling) is
 * future work tracked in the roadmap.
 */
public class GeminiClientReal implements GeminiClient {

    private static final Logger log = LoggerFactory.getLogger(GeminiClientReal.class);

    private final RestClient restClient;
    private final AgriGuardianProperties.Gemini cfg;
    private final Tracer tracer;

    public GeminiClientReal(AgriGuardianProperties.Gemini cfg, Tracer tracer) {
        this.cfg = cfg;
        this.tracer = tracer;
        this.restClient = RestClient.builder().baseUrl(cfg.getBaseUrl()).build();
    }

    @Override
    public String generate(String systemPrompt, String userPrompt, Map<String, Object> context) {
        Span span = tracer.spanBuilder("gemini.generate")
                .setAttribute(AttributeKey.stringKey("model"), cfg.getModel())
                .setAttribute(AttributeKey.longKey("prompt.tokens.estimate"),
                        (long) ((systemPrompt.length() + userPrompt.length()) / 4))
                .startSpan();
        try (var scope = span.makeCurrent()) {
            String prompt = systemPrompt + "\n\nContext:" + context + "\n\nUser:" + userPrompt;
            Map<String, Object> body = Map.of(
                    "contents", List.of(Map.of(
                            "role", "user",
                            "parts", List.of(Map.of("text", prompt))
                    ))
            );
            String path = "/models/" + cfg.getModel() + ":generateContent?key=" + cfg.getApiKey();

            @SuppressWarnings("unchecked")
            Map<String, Object> resp = restClient.post()
                    .uri(path)
                    .body(body)
                    .retrieve()
                    .body(Map.class);

            return extractText(resp);
        } catch (RestClientResponseException http) {
            // Log the full response body so model-not-found / quota / auth errors are visible.
            String body = http.getResponseBodyAsString();
            log.warn("Gemini HTTP {} for model={} : {}",
                    http.getStatusCode(), cfg.getModel(),
                    body.length() > 800 ? body.substring(0, 800) + "...[truncated]" : body);
            span.recordException(http);
            return "{\"advice\":\"Gemini call failed — please retry.\",\"tasks\":[],\"confidence\":0.0}";
        } catch (Exception ex) {
            span.recordException(ex);
            log.warn("Gemini call failed, returning empty advice: {}", ex.toString());
            return "{\"advice\":\"Gemini call failed — please retry.\",\"tasks\":[],\"confidence\":0.0}";
        } finally {
            span.end();
        }
    }

    @SuppressWarnings("unchecked")
    private static String extractText(Map<String, Object> resp) {
        if (resp == null) return "";
        List<Map<String, Object>> candidates = (List<Map<String, Object>>) resp.get("candidates");
        if (candidates == null || candidates.isEmpty()) return "";
        Map<String, Object> content = (Map<String, Object>) candidates.get(0).get("content");
        if (content == null) return "";
        List<Map<String, Object>> parts = (List<Map<String, Object>>) content.get("parts");
        if (parts == null || parts.isEmpty()) return "";
        return String.valueOf(parts.get(0).getOrDefault("text", ""));
    }
}

