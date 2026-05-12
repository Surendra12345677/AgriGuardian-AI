package com.Hackathon.AgriGuardian.AI.api;

import com.Hackathon.AgriGuardian.AI.observability.CorrelationIdFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.net.URI;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.stream.Collectors;

/**
 * Global error handler returning <a href="https://www.rfc-editor.org/rfc/rfc7807">RFC 7807</a>
 * {@code application/problem+json} responses. Adds the request-id from
 * {@link CorrelationIdFilter} so a failure can be traced end-to-end.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail handleValidation(MethodArgumentNotValidException ex) {
        Map<String, String> fields = ex.getBindingResult().getFieldErrors().stream()
                .collect(Collectors.toMap(
                        f -> f.getField(),
                        f -> f.getDefaultMessage() == null ? "invalid" : f.getDefaultMessage(),
                        (a, b) -> a, LinkedHashMap::new));
        return problem(HttpStatus.BAD_REQUEST,
                "Validation failed",
                "One or more fields failed validation.",
                "/problems/validation",
                Map.of("errors", fields));
    }

    @ExceptionHandler(NoSuchElementException.class)
    public ProblemDetail handleNotFound(NoSuchElementException ex) {
        return problem(HttpStatus.NOT_FOUND,
                "Not Found",
                ex.getMessage(),
                "/problems/not-found",
                Map.of());
    }

    @ExceptionHandler(Exception.class)
    public ProblemDetail handleGeneric(Exception ex) {
        log.error("Unhandled exception", ex);
        return problem(HttpStatus.INTERNAL_SERVER_ERROR,
                "Internal Server Error",
                "Unexpected error — see server logs.",
                "/problems/internal",
                Map.of());
    }

    private static ProblemDetail problem(HttpStatus status, String title, String detail,
                                         String typePath, Map<String, Object> extras) {
        ProblemDetail p = ProblemDetail.forStatusAndDetail(status, detail);
        p.setTitle(title);
        p.setType(URI.create(typePath));
        p.setProperty("timestamp", Instant.now().toString());
        String requestId = MDC.get(CorrelationIdFilter.MDC_KEY);
        if (requestId != null) {
            p.setProperty("requestId", requestId);
        }
        extras.forEach(p::setProperty);
        return p;
    }
}

