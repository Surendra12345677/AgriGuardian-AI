package com.Hackathon.AgriGuardian.AI.ai;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Deterministic stub used when no Gemini API key is configured
 * ({@code stub-mode=always} or blank key).
 *
 * <p>No hardcoded crop bias: reads {@code preferredCrop} from context.
 * Detects Plant Doctor calls (by system-prompt keyword "PlantDoctor" or
 * "diagnos") and returns the correct diagnosis schema — not a farming
 * recommendation — so the frontend renders the right UI in both cases.</p>
 */
public class GeminiClientStub implements GeminiClient {

    @Override
    public String generate(String systemPrompt, String userPrompt, Map<String, Object> context) {
        boolean isDiagnose = (systemPrompt != null
                && (systemPrompt.contains("PlantDoctor") || systemPrompt.toLowerCase().contains("diagnos")))
                || context.containsKey("symptoms");
        return isDiagnose ? diagnosisStub(userPrompt) : recommendationStub(context);
    }

    private static String diagnosisStub(String userPrompt) {
        String crop = "this crop";
        if (userPrompt != null) {
            for (String line : userPrompt.split("\n")) {
                if (line.startsWith("Crop:")) { crop = line.substring(5).trim(); break; }
            }
        }
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("diagnosis",   "Stub mode — Gemini API key not configured");
        p.put("confidence",  0.0);
        p.put("explanation", "Set GEMINI_API_KEY to receive a real AI diagnosis for " + crop + ".");
        p.put("treatments",  List.of(Map.of("step", "Configure GEMINI_API_KEY for live diagnosis", "cost", "LOW")));
        p.put("prevention",  List.of("Enable Gemini API key to get real prevention advice"));
        p.put("urgency",     "LOW");
        p.put("_source",     "stub");
        return toJson(p);
    }

    private static String recommendationStub(Map<String, Object> context) {
        Object preferred = context.getOrDefault("preferredCrop", null);
        String cropLabel = (preferred != null && !String.valueOf(preferred).isBlank())
                ? String.valueOf(preferred) : "";
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("advice", "Stub mode — Gemini API key not configured."
                + (cropLabel.isBlank() ? "" : " Preferred crop noted: " + cropLabel + ".")
                + " Set GEMINI_API_KEY for a live AI season plan.");
        p.put("crop",      cropLabel);
        p.put("tasks",     List.of("Configure GEMINI_API_KEY to receive a real day-by-day plan"));
        p.put("confidence", 0.0);
        p.put("impact",    Map.of("extraIncomeInr", 0, "expectedRevenueInr", 0,
                "yieldDeltaPct", 0, "waterSavingsPct", 0, "costInr", 0, "paybackWeeks", 0));
        p.put("risks",     List.of("Gemini API key not set — configure it to get real AI recommendations"));
        p.put("_source",   "stub");
        return toJson(p);
    }

    private static String toJson(Map<String, Object> map) {
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (Map.Entry<String, Object> e : map.entrySet()) {
            if (!first) sb.append(",");
            first = false;
            sb.append("\"").append(e.getKey()).append("\":").append(jsonValue(e.getValue()));
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
