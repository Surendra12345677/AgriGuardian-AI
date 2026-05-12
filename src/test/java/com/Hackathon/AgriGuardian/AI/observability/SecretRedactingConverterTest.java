package com.Hackathon.AgriGuardian.AI.observability;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SecretRedactingConverterTest {

    @Test
    void redactsKeyValueSecrets() {
        String in  = "Loaded api_key=AIzaSyDBsY6dPn5P5N6nBBWzKuhRJ5CP0rvWN8c for user";
        String out = SecretRedactingConverter.redact(in);
        assertThat(out).doesNotContain("AIzaSyDBsY6dPn5P5N6nBBWzKuhRJ5CP0rvWN8c");
        assertThat(out).contains("***REDACTED***");
    }

    @Test
    void redactsArizeServiceKey() {
        String in  = "Using Arize key ak-7a51c094-7136-40ac-947a-f849e3e9f418-j5IgZpcScHZFHIZyX9dUs_sO1s9ng4x6 today";
        String out = SecretRedactingConverter.redact(in);
        assertThat(out).doesNotContain("ak-7a51c094");
        assertThat(out).contains("***REDACTED***");
    }

    @Test
    void redactsBearerHeader() {
        String in  = "Authorization: Bearer abcdef.123456.xyz";
        String out = SecretRedactingConverter.redact(in);
        assertThat(out).doesNotContain("abcdef.123456.xyz");
    }

    @Test
    void leavesPlainMessagesUnchanged() {
        String in  = "Persisted recommendation id=rec-42 farmId=farm-1";
        assertThat(SecretRedactingConverter.redact(in)).isEqualTo(in);
    }

    @Test
    void nullSafe() {
        assertThat(SecretRedactingConverter.redact(null)).isNull();
        assertThat(SecretRedactingConverter.redact("")).isEmpty();
    }
}

