package com.Hackathon.AgriGuardian.AI.api;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.stream.Collectors;

/** Maps known exceptions to a small, safe {@link ApiError}-shaped JSON body. */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    public record ApiError(Instant timestamp, int status, String error, String message, Object details) {}

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException ex) {
        Map<String, String> fields = ex.getBindingResult().getFieldErrors().stream()
                .collect(Collectors.toMap(
                        f -> f.getField(),
                        f -> f.getDefaultMessage() == null ? "invalid" : f.getDefaultMessage(),
                        (a, b) -> a, LinkedHashMap::new));
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(new ApiError(
                Instant.now(), 400, "Bad Request", "Validation failed", fields));
    }

    @ExceptionHandler(NoSuchElementException.class)
    public ResponseEntity<ApiError> handleNotFound(NoSuchElementException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ApiError(
                Instant.now(), 404, "Not Found", ex.getMessage(), null));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> handleGeneric(Exception ex) {
        log.error("Unhandled exception", ex);
        // Never leak stack traces to clients.
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(new ApiError(
                Instant.now(), 500, "Internal Server Error", "Unexpected error — see server logs.", null));
    }
}

