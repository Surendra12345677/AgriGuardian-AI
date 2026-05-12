package com.Hackathon.AgriGuardian.AI.api;

import com.Hackathon.AgriGuardian.AI.api.dto.FarmRequest;
import com.Hackathon.AgriGuardian.AI.domain.model.Farm;
import com.Hackathon.AgriGuardian.AI.domain.repo.FarmRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(FarmController.class)
class FarmControllerTest {

    @Autowired MockMvc mvc;
    @MockitoBean FarmRepository repo;
    private final ObjectMapper json = new ObjectMapper();

    private Farm sampleSaved() {
        return Farm.builder()
                .id("farm-1")
                .farmerName("Anita")
                .latitude(18.52).longitude(73.85)
                .landSizeAcres(2.0)
                .waterAvailability("MEDIUM")
                .soilType("BLACK")
                .budgetInr(50_000)
                .createdAt(Instant.now())
                .build();
    }

    @Test
    void create_validRequest_returns201WithLocationAndBody() throws Exception {
        when(repo.save(any(Farm.class))).thenReturn(sampleSaved());

        FarmRequest req = new FarmRequest(
                "Anita", "+91-9999900000",
                18.52, 73.85, 2.0,
                "MEDIUM", "BLACK", 50_000);

        mvc.perform(post("/api/v1/farms")
                       .contentType(MediaType.APPLICATION_JSON)
                       .content(json.writeValueAsString(req)))
           .andExpect(status().isCreated())
           .andExpect(header().string("Location", "/api/v1/farms/farm-1"))
           .andExpect(jsonPath("$.id").value("farm-1"))
           .andExpect(jsonPath("$.farmerName").value("Anita"));
    }

    @Test
    void create_invalidWaterAvailability_returns400ProblemDetail() throws Exception {
        FarmRequest req = new FarmRequest(
                "Anita", null,
                18.52, 73.85, 2.0,
                "TONS",          // invalid
                "BLACK", 50_000);

        mvc.perform(post("/api/v1/farms")
                       .contentType(MediaType.APPLICATION_JSON)
                       .content(json.writeValueAsString(req)))
           .andExpect(status().isBadRequest())
           .andExpect(jsonPath("$.status").value(400))
           .andExpect(jsonPath("$.errors.waterAvailability").exists());
    }

    @Test
    void getById_missing_returns404ProblemDetail() throws Exception {
        when(repo.findById("nope")).thenReturn(Optional.empty());
        mvc.perform(get("/api/v1/farms/nope"))
           .andExpect(status().isNotFound())
           .andExpect(jsonPath("$.status").value(404));
    }

    @Test
    void delete_returns204() throws Exception {
        mvc.perform(delete("/api/v1/farms/farm-1"))
           .andExpect(status().isNoContent());
    }
}

