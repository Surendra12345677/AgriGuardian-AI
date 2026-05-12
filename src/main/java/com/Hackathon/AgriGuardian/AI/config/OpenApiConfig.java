package com.Hackathon.AgriGuardian.AI.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * OpenAPI / Swagger UI metadata.
 * <p>UI: <a href="http://localhost:8080/swagger-ui.html">/swagger-ui.html</a><br>
 * Spec: <a href="http://localhost:8080/v3/api-docs">/v3/api-docs</a></p>
 */
@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI agriGuardianOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("AgriGuardian AI API")
                        .description("""
                                Agentic farm-advisor built on Google Cloud Agent Builder.
                                Reasoning by Gemini, observability via Arize AX (OTLP).
                                """)
                        .version("0.1.0")
                        .contact(new Contact()
                                .name("AgriGuardian AI Team")
                                .url("https://github.com/Surendra12345677/AgriGuardian-AI"))
                        .license(new License()
                                .name("MIT")
                                .url("https://opensource.org/licenses/MIT")));
    }
}

