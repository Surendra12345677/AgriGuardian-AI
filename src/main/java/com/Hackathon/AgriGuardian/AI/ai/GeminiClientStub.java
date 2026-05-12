package com.Hackathon.AgriGuardian.AI.ai;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Deterministic stub that returns a JSON-shaped advice string. Used when no
 * Gemini API key is configured (or {@code stub-mode=always}). Lets judges run
 * the agent fully offline.
 */
public class GeminiClientStub implements GeminiClient {

    @Override
    public String generate(String systemPrompt, String userPrompt, Map<String, Object> context) {
        Object preferred = context.getOrDefault("preferredCrop", "maize");
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("advice", "Based on current soil and weather, " + preferred
                + " is a strong choice. Sow within the next 5 days, irrigate twice in week 1, "
                + "and watch for aphid pressure.");
        payload.put("tasks", List.of(
                "Prepare seedbed and add 25kg compost",
                "Sow " + preferred + " at 4 cm depth",
                "Light irrigation on day 2",
                "Pest scout on day 7",
                "Top dress nitrogen on day 21"
        ));
        payload.put("confidence", 0.78);
        return toJson(payload);
    }

    private static String toJson(Map<String, Object> map) {
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (Map.Entry<String, Object> e : map.entrySet()) {
            if (!first) sb.append(",");
            first = false;
            sb.append("\"").append(e.getKey()).append("\":");
            sb.append(jsonValue(e.getValue()));
        }
        return sb.append("}").toString();
    }

    @SuppressWarnings("unchecked")
    private static String jsonValue(Object v) {
        if (v == null) return "null";
        if (v instanceof Number || v instanceof Boolean) return v.toString();
        if (v instanceof List<?> list) {
            StringBuilder sb = new StringBuilder("[");
            for (int i = 0; i < list.size(); i++) {
                if (i > 0) sb.append(",");
                sb.append(jsonValue(list.get(i)));
            }
            return sb.append("]").toString();
        }
        if (v instanceof Map) return toJson((Map<String, Object>) v);
        return "\"" + v.toString().replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }
}

