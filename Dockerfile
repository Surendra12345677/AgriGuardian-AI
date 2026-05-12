# syntax=docker/dockerfile:1.7
# ──────────────────────────────────────────────────────────────
# AgriGuardian AI — multi-stage Dockerfile
#   stage 1 (build): JDK 17 + Gradle wrapper → bootJar
#   stage 2 (run):   JRE 17 slim, non-root, healthcheck via actuator
# ──────────────────────────────────────────────────────────────

############################
# Stage 1 — build
############################
FROM eclipse-temurin:17-jdk-jammy AS build
WORKDIR /workspace

# Cache deps first
COPY gradlew settings.gradle build.gradle ./
COPY gradle ./gradle
RUN chmod +x ./gradlew && ./gradlew --no-daemon dependencies > /dev/null 2>&1 || true

# Copy sources and build the boot jar
COPY src ./src
RUN ./gradlew --no-daemon clean bootJar -x test

############################
# Stage 2 — runtime
############################
FROM eclipse-temurin:17-jre-jammy
WORKDIR /app

# Non-root user
RUN groupadd --system spring && useradd --system --gid spring --home /app spring \
 && chown -R spring:spring /app
USER spring:spring

COPY --from=build --chown=spring:spring /workspace/build/libs/*.jar /app/app.jar

ENV PORT=8080 \
    SPRING_PROFILES_ACTIVE=prod \
    JAVA_OPTS=""

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/actuator/health | grep -q '"status":"UP"' || exit 1

ENTRYPOINT ["sh","-c","exec java $JAVA_OPTS -jar /app/app.jar"]

