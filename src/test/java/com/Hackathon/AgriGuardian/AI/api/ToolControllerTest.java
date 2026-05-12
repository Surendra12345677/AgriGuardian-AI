package com.Hackathon.AgriGuardian.AI.api;

import com.Hackathon.AgriGuardian.AI.agent.tool.AgentTool;
import com.Hackathon.AgriGuardian.AI.agent.tool.ToolRegistry;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ToolController.class)
class ToolControllerTest {

    @Autowired MockMvc mvc;
    private final ObjectMapper json = new ObjectMapper();

    @MockitoBean AgentTool weatherTool;
    @MockitoBean ToolRegistry registry;

    @BeforeEach
    void setUp() {
        when(weatherTool.name()).thenReturn("weather");
        when(weatherTool.description()).thenReturn("weather stub");
        when(weatherTool.invoke(any())).thenReturn(Map.of("tempAvgC", 28.5, "source", "open-meteo"));
        when(registry.all()).thenReturn(Map.of("weather", weatherTool));
    }

    @Test
    void listTools_returnsRegistryDescriptions() throws Exception {
        mvc.perform(get("/api/v1/tools"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.weather").value("weather stub"));
    }

    @Test
    void weather_invokesUnderlyingTool_andReturnsItsOutput() throws Exception {
        var body = Map.of("latitude", 18.52, "longitude", 73.85);
        mvc.perform(post("/api/v1/tools/weather")
                       .contentType(MediaType.APPLICATION_JSON)
                       .content(json.writeValueAsString(body)))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.tempAvgC").value(28.5))
           .andExpect(jsonPath("$.source").value("open-meteo"));
    }

    @Test
    void dispatch_unknownTool_returns404() throws Exception {
        mvc.perform(post("/api/v1/tools/no-such-tool")
                       .contentType(MediaType.APPLICATION_JSON)
                       .content("{}"))
           .andExpect(status().isNotFound());
    }
}

