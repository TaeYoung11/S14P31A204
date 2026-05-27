package com.a204.batang.domain.floorplan.repository;

import com.a204.batang.domain.floorplan.entity.FloorPlanJobStep;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

/**
 * Floor-plan job step repository.
 */
public interface FloorPlanJobStepRepository extends JpaRepository<FloorPlanJobStep, UUID> {

    Optional<FloorPlanJobStep> findByJobStepIdAndJobId(UUID jobStepId, UUID jobId);

    Optional<FloorPlanJobStep> findByIdempotencyKey(String idempotencyKey);
}
