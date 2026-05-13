package com.Hackathon.AgriGuardian.AI.agent;

import com.Hackathon.AgriGuardian.AI.agent.tool.AgentTool;
import com.Hackathon.AgriGuardian.AI.agent.tool.ToolRegistry;
import com.Hackathon.AgriGuardian.AI.ai.GeminiClient;
import com.Hackathon.AgriGuardian.AI.api.dto.RecommendationRequest;
import com.Hackathon.AgriGuardian.AI.domain.model.Recommendation;
import com.Hackathon.AgriGuardian.AI.domain.repo.RecommendationRepository;
import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.api.trace.Tracer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class AgentOrchestratorTest {

    private GeminiClient gemini;
    private RecommendationRepository repo;
    private AgentTool weather;
    private AgentTool soil;
    private AgentTool market;
    private AgentOrchestrator orchestrator;

    @BeforeEach
    void setUp() {
        gemini = mock(GeminiClient.class);
        repo = mock(RecommendationRepository.class);
        weather = stubTool("weather", Map.of("tempC", 28.0));
        soil = stubTool("soil", Map.of("type", "loam"));
        market = stubTool("market", Map.of("price", 2350));
        Tracer tracer = OpenTelemetry.noop().getTracer("test");
        ToolRegistry registry = new ToolRegistry(List.of(weather, soil, market));
        orchestrator = new AgentOrchestrator(registry, gemini, repo, tracer);

        when(gemini.generate(any(), any(), any())).thenReturn("{\"advice\":\"ok\"}");
        when(repo.save(any(Recommendation.class)))
                .thenAnswer(inv -> {
                    Recommendation r = inv.getArgument(0);
                    r.setId("saved-1");
                    return r;
                });
    }

    @Test
    void run_invokesAllToolsThenGeneratesAndPersists() {
        var req = new RecommendationRequest("farm-1", 18.5, 73.8, "maize", "en", "BASELINE");

        Recommendation result = orchestrator.run(req);

        assertThat(result.getId()).isEqualTo("saved-1");
        assertThat(result.getFarmId()).isEqualTo("farm-1");

        // tool order: weather → soil → market
        var inOrder = inOrder(weather, soil, market, gemini, repo);
        inOrder.verify(weather).invoke(any());
        inOrder.verify(soil).invoke(any());
        inOrder.verify(market).invoke(any());
        inOrder.verify(gemini).generate(any(), any(), any());
        inOrder.verify(repo).save(any(Recommendation.class));
    }

    private static AgentTool stubTool(String name, Map<String, Object> output) {
        AgentTool t = mock(AgentTool.class);
        when(t.name()).thenReturn(name);
        when(t.description()).thenReturn(name + " stub");
        when(t.invoke(any())).thenReturn(output);
        return t;
    }
}

