package com.Hackathon.AgriGuardian.AI;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

@SpringBootTest
@ActiveProfiles("test")
@TestPropertySource(properties = {
		"agriguardian.arize.enabled=false",
		"agriguardian.gemini.stub-mode=always"
})
class AgriGuardianAiApplicationTests {

	@Test
	void contextLoads() {
	}

}
