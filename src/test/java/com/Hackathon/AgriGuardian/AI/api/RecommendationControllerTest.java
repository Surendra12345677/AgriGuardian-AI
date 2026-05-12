package com.Hackathon.AgriGuardian.AI.api;

import com.Hackathon.AgriGuardian.AI.agent.AgentOrchestrator;
import com.Hackathon.AgriGuardian.AI.domain.model.Recommendation;
import com.Hackathon.AgriGuardian.AI.domain.repo.RecommendationRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(RecommendationController.class)
class RecommendationControllerTest {

    @Autowired MockMvc mvc;
    private final ObjectMapper json = new ObjectMapper();

    @MockitoBean AgentOrchestrator orchestrator;
    @MockitoBean RecommendationRepository repo;

    @Test
    void post_validRequest_returns200WithBody() throws Exception {
        Recommendation rec = Recommendation.builder()
                .id("rec-1")
                .farmId("farm-42")
                .reasoning("{\"advice\":\"sow now\"}")
                .traceId("trace-abc")
                .createdAt(Instant.parse("2026-05-01T10:00:00Z"))
                .build();
        when(orchestrator.run(any())).thenReturn(rec);

        var body = Map.of(
                "farmId", "farm-42",
                "latitude", 18.52,
                "longitude", 73.85,
                "preferredCrop", "maize"
        );

        mvc.perform(post("/api/v1/recommendations")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value("rec-1"))
                .andExpect(jsonPath("$.farmId").value("farm-42"))
                .andExpect(jsonPath("$.traceId").value("trace-abc"));
    }

    @Test
    void post_missingFarmId_returns400() throws Exception {
        var body = Map.of(
                "latitude", 18.52,
                "longitude", 73.85
        );

        mvc.perform(post("/api/v1/recommendations")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400));
    }
}

