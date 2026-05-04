package com.a204.batang.domain.floorplan.repository;

import com.a204.batang.domain.floorplan.entity.FloorPlanJob;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

/**
 * Floor-plan job repository.
 */
public interface FloorPlanJobRepository extends JpaRepository<FloorPlanJob, UUID> {

    Optional<FloorPlanJob> findByJobIdAndJobType(UUID jobId, String jobType);

    Optional<FloorPlanJob> findByJobIdAndProjectId(UUID jobId, UUID projectId);
}
