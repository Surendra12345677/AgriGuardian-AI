package com.Hackathon.AgriGuardian.AI.api;

import com.Hackathon.AgriGuardian.AI.api.dto.FarmRequest;
import com.Hackathon.AgriGuardian.AI.domain.model.Farm;
import com.Hackathon.AgriGuardian.AI.domain.repo.FarmRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.NoSuchElementException;

/**
 * Farm onboarding + CRUD. Each farm is the unit a recommendation is anchored to.
 *
 * <p>Endpoints intentionally minimal — judges + the agent both need read/create;
 * advanced ops (search, geo-radius) are out of scope for the hackathon demo.</p>
 */
@RestController
@RequestMapping("/api/v1/farms")
@Tag(name = "Farms", description = "Farm onboarding and lookup.")
public class FarmController {

    private static final Logger log = LoggerFactory.getLogger(FarmController.class);

    private final FarmRepository repo;

    public FarmController(FarmRepository repo) {
        this.repo = repo;
    }

    @PostMapping
    @Operation(summary = "Onboard a new farm. Returns 201 + Location header.")
    public ResponseEntity<Farm> create(@Valid @RequestBody FarmRequest req) {
        Farm farm = Farm.builder()
                .farmerName(req.farmerName())
                .contact(req.contact())
                .latitude(req.latitude())
                .longitude(req.longitude())
                .landSizeAcres(req.landSizeAcres())
                .waterAvailability(req.waterAvailability())
                .soilType(req.soilType())
                .budgetInr(req.budgetInr())
                .createdAt(Instant.now())
                .build();
        Farm saved = repo.save(farm);
        log.info("Onboarded farm id={} owner={}", saved.getId(), saved.getFarmerName());
        return ResponseEntity
                .created(URI.create("/api/v1/farms/" + saved.getId()))
                .body(saved);
    }

    @GetMapping
    @Operation(summary = "List all farms (paginated views are a TODO).")
    public List<Farm> list() {
        return repo.findAll();
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get a farm by id. Returns 404 if not found.")
    public Farm getById(@PathVariable String id) {
        return repo.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Farm not found: " + id));
    }

    /**
     * Update an existing farm. Used by the onboarding UI when the user
     * relocates the map pin for an already-saved farm — we want that to
     * actually persist (and therefore re-ground every subsequent
     * recommendation), not silently create a duplicate.
     */
    @PutMapping("/{id}")
    @Operation(summary = "Replace an existing farm's profile (used to relocate the pin).")
    public Farm update(@PathVariable String id, @Valid @RequestBody FarmRequest req) {
        Farm existing = repo.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Farm not found: " + id));
        existing.setFarmerName(req.farmerName());
        existing.setContact(req.contact());
        existing.setLatitude(req.latitude());
        existing.setLongitude(req.longitude());
        existing.setLandSizeAcres(req.landSizeAcres());
        existing.setWaterAvailability(req.waterAvailability());
        existing.setSoilType(req.soilType());
        existing.setBudgetInr(req.budgetInr());
        Farm saved = repo.save(existing);
        log.info("Updated farm id={} owner={} lat={} lon={}",
                saved.getId(), saved.getFarmerName(), saved.getLatitude(), saved.getLongitude());
        return saved;
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Delete a farm by id (idempotent — 204 even when missing).")
    public void delete(@PathVariable String id) {
        repo.deleteById(id);
        log.info("Deleted farm id={}", id);
    }
}

