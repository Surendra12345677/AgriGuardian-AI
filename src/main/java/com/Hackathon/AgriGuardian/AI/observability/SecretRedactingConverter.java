package com.Hackathon.AgriGuardian.AI.observability;

import ch.qos.logback.classic.pattern.MessageConverter;
import ch.qos.logback.classic.spi.ILoggingEvent;

import java.util.regex.Pattern;

/**
 * Logback message rewriter that masks secrets at the source — defence in
 * depth so a stray {@code log.info("key=" + apiKey)} cannot leak credentials.
 *
 * <p>Patterns covered:
 * <ul>
 *   <li>{@code key=value} style: {@code password|secret|token|api_key|authorization|bearer}</li>
 *   <li>Google / Gemini API keys ({@code AIza…})</li>
 *   <li>Arize service keys ({@code ak-…})</li>
 *   <li>AWS access keys ({@code AKIA…}, {@code ASIA…})</li>
 *   <li>GitHub tokens ({@code ghp_…}, {@code gho_…}, {@code ghs_…}, {@code ghu_…})</li>
 * </ul>
 *
 * <p>Wired in {@code logback-spring.xml} so it applies to every appender.</p>
 */
public class SecretRedactingConverter extends MessageConverter {

    // Matches: key=value | key: value | Authorization: Bearer <token>
    private static final Pattern KV = Pattern.compile(
            "(?i)(password|secret|token|api[_-]?key|authorization|bearer)\\s*[:=]?\\s*(?:Bearer\\s+)?([^\\s,;]+)");

    // Vendor-specific high-entropy key patterns.
    private static final Pattern GOOGLE_KEY = Pattern.compile("AIza[0-9A-Za-z_-]{20,}");
    private static final Pattern ARIZE_KEY  = Pattern.compile("ak-[0-9a-f-]{8,}-[0-9A-Za-z_-]{8,}");
    private static final Pattern AWS_KEY    = Pattern.compile("\\b(AKIA|ASIA)[0-9A-Z]{16}\\b");
    private static final Pattern GH_TOKEN   = Pattern.compile("\\bgh[posu]_[0-9A-Za-z]{30,}\\b");

    private static final String MASK = "***REDACTED***";

    @Override
    public String convert(ILoggingEvent event) {
        return redact(super.convert(event));
    }

    /** Public for unit tests. */
    public static String redact(String input) {
        if (input == null || input.isEmpty()) return input;
        String s = input;
        s = KV.matcher(s).replaceAll(m -> m.group(1) + "=" + MASK);
        s = GOOGLE_KEY.matcher(s).replaceAll(MASK);
        s = ARIZE_KEY.matcher(s).replaceAll(MASK);
        s = AWS_KEY.matcher(s).replaceAll(MASK);
        s = GH_TOKEN.matcher(s).replaceAll(MASK);
        return s;
    }
}

