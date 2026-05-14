package com.Hackathon.AgriGuardian.AI.ai;

/**
 * Thrown by {@link GeminiClientReal} when a call to Gemini cannot be completed.
 * The message is intentionally operator-actionable (mentions billing,
 * quotas, model names) and is surfaced verbatim to the API caller via
 * {@code GlobalExceptionHandler}.
 */
public class GeminiException extends RuntimeException {
    public GeminiException(String message)                  { super(message); }
    public GeminiException(String message, Throwable cause) { super(message, cause); }
}

