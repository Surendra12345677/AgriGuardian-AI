package com.Hackathon.AgriGuardian.AI.api;

import com.Hackathon.AgriGuardian.AI.ai.GeminiClient;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Plant Doctor — describe symptoms, Gemini diagnoses likely disease + treatment.
 * Used by the frontend's "Plant Doctor" panel.
 */
@RestController
@RequestMapping("/api/v1/diagnose")
@Tag(name = "Plant Doctor", description = "Diagnose crop disease from a symptom description.")
public class DiagnoseController {

    private final GeminiClient gemini;

    public DiagnoseController(GeminiClient gemini) { this.gemini = gemini; }

    public record DiagnoseRequest(@NotBlank String crop, @NotBlank String symptoms, String language) {}
    public record DiagnoseResponse(String raw) {}

    @PostMapping
    @Operation(summary = "Diagnose a crop ailment from symptom text")
    public DiagnoseResponse diagnose(@Valid @RequestBody DiagnoseRequest req) {
        String lang = req.language() == null ? "en" : req.language();
        String langName = switch (lang) {
            case "hi" -> "Hindi (Devanagari)";
            case "mr" -> "Marathi (Devanagari)";
            case "ta" -> "Tamil";
            case "te" -> "Telugu";
            case "bn" -> "Bengali";
            case "pa" -> "Punjabi";
            default -> "English";
        };
        String sys = """
                You are PlantDoctor, an expert agronomist. Diagnose the most likely disease/pest
                from the farmer's symptom description. Reply ONLY as compact valid JSON (no fences):
                  "diagnosis"   : string (likely disease/pest name)
                  "confidence"  : float 0..1
                  "explanation" : 1-2 sentences in %s
                  "treatments"  : array of {"step": string, "cost": "LOW"|"MED"|"HIGH"}
                  "prevention"  : array of strings (top 3 future preventives)
                  "urgency"     : "LOW" | "MEDIUM" | "HIGH"
                """.formatted(langName);
        String user = "Crop: " + req.crop() + "\nSymptoms: " + req.symptoms();
        return new DiagnoseResponse(gemini.generate(sys, user, Map.of()));
    }
}

