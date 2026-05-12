package com.Hackathon.AgriGuardian.AI.ai;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class GeminiClientStubTest {

    @Test
    void generate_returnsDeterministicJsonShape() {
        GeminiClientStub stub = new GeminiClientStub();
        String first = stub.generate("sys", "user", Map.of("preferredCrop", "maize"));
        String second = stub.generate("sys", "user", Map.of("preferredCrop", "maize"));

        assertThat(first).isEqualTo(second);
        assertThat(first).contains("\"advice\":");
        assertThat(first).contains("\"tasks\":");
        assertThat(first).contains("\"confidence\":");
        assertThat(first).contains("maize");
    }
}

