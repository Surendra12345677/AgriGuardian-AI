package com.Hackathon.AgriGuardian.AI.ai;

import java.util.Map;

/** Abstraction over Gemini so we can swap in a deterministic stub for tests / keyless demos. */
public interface GeminiClient {
    /**
     * @param systemPrompt high-level role instructions
     * @param userPrompt   end-user prompt
     * @param context      structured tool outputs to ground the response
     * @return raw model text (typically JSON)
     */
    String generate(String systemPrompt, String userPrompt, Map<String, Object> context);
}

