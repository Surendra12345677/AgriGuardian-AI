package com.Hackathon.AgriGuardian.AI.agent.tool.impl;

import com.Hackathon.AgriGuardian.AI.agent.tool.AgentTool;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Soil knowledge-base tool.
 *
 * <p>Resolution order (first hit wins):</p>
 * <ol>
 *   <li>{@code soilType} arg — the orchestrator passes the value stored on the
 *       Farm document (LOAM | CLAY | SANDY | BLACK | RED) so a user-corrected
 *       soil profile is always honoured.</li>
 *   <li>Coarse lat/lon → Indian agro-ecological zone heuristic. Replaces the
 *       previous {@code "loam"}-everywhere stub so two farms in different
 *       regions get different recommendations.</li>
 *   <li>Final fallback: loam.</li>
 * </ol>
 *
 * <p>TODO: lookup via SoilGrids / national soil API for a real reading.</p>
 */
@Component
public class SoilTool implements AgentTool {
    @Override public String name() { return "soil"; }

    @Override public String description() {
        return "Returns soil composition (type, pH, macro-nutrient level) for a lat/lon, "
                + "honouring the soilType stored on the farm record when supplied.";
    }

    @Override public Map<String, Object> invoke(Map<String, Object> args) {
        String hint = String.valueOf(args.getOrDefault("soilType", ""))
                .toLowerCase(Locale.ROOT).trim();
        double lat = asDouble(args.get("latitude"),  Double.NaN);
        double lon = asDouble(args.get("longitude"), Double.NaN);

        String type;
        String source;
        if (!hint.isBlank() && !"null".equals(hint)) {
            type   = normalize(hint);
            source = "farm-record";
        } else if (!Double.isNaN(lat) && !Double.isNaN(lon)) {
            type   = inferFromCoords(lat, lon);
            source = "geo-heuristic";
        } else {
            type   = "loam";
            source = "fallback";
        }

        // Type-specific pH + nitrogen baselines (rough Indian averages).
        double ph;
        String nitrogen;
        switch (type) {
            case "black"  -> { ph = 7.8; nitrogen = "medium"; }
            case "clay"   -> { ph = 7.2; nitrogen = "medium"; }
            case "sandy"  -> { ph = 7.5; nitrogen = "low"; }
            case "red"    -> { ph = 6.2; nitrogen = "low"; }
            case "loam"   -> { ph = 6.7; nitrogen = "medium"; }
            default       -> { ph = 6.8; nitrogen = "medium"; }
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("type", type);
        out.put("ph", ph);
        out.put("nitrogen", nitrogen);
        out.put("source", source);
        return out;
    }

    /** Map any incoming label (LOAM, Black-cotton, regur, vertisol, …) to the canonical 5. */
    private static String normalize(String s) {
        if (s.contains("black") || s.contains("regur") || s.contains("vertisol")) return "black";
        if (s.contains("clay"))                                                    return "clay";
        if (s.contains("sand") || s.contains("desert") || s.contains("arid"))      return "sandy";
        if (s.contains("red")  || s.contains("lateri"))                            return "red";
        if (s.contains("loam") || s.contains("silt") || s.contains("alluv"))       return "loam";
        return "loam";
    }

    /**
     * Coarse Indian soil-zone map. Not a substitute for SoilGrids, but good
     * enough that Shujalpur (23.4°N, 76.6°E) returns "black" instead of "loam".
     */
    private static String inferFromCoords(double lat, double lon) {
        // Thar / arid west — sandy.
        if (lon < 73.5 && lat >= 24 && lat <= 30)                  return "sandy";
        // Black-cotton belt: Madhya Pradesh, Maharashtra, parts of Gujarat & Telangana.
        if (lat >= 17 && lat <= 24 && lon >= 73 && lon <= 81)      return "black";
        // Southern peninsula uplands — red / lateritic.
        if (lat < 17 && lon >= 74 && lon <= 80)                    return "red";
        // Coastal Konkan / Kerala / Karnataka — lateritic red.
        if (lat < 16 && lon < 76)                                  return "red";
        // Eastern coast & Bengal delta — clayey alluvium.
        if ((lat >= 19 && lat <= 24 && lon >= 85)
                || (lat >= 16 && lat <= 20 && lon >= 80))          return "clay";
        // Indo-Gangetic plain (UP / Bihar / Punjab / Haryana) — loamy alluvium.
        if (lat >= 24 && lat <= 32 && lon >= 73 && lon <= 88)      return "loam";
        return "loam";
    }

    private static double asDouble(Object o, double def) {
        if (o instanceof Number n) return n.doubleValue();
        if (o instanceof String s && !s.isBlank()) {
            try { return Double.parseDouble(s); } catch (NumberFormatException ignored) { }
        }
        return def;
    }
}
