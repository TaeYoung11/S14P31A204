package com.a204.batang.domain.floorplan.repository;

import com.a204.batang.domain.floorplan.entity.FloorPlanArtifact;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Floor-plan artifact repository.
 */
public interface FloorPlanArtifactRepository extends JpaRepository<FloorPlanArtifact, UUID> {

    Optional<FloorPlanArtifact> findByArtifactId(UUID artifactId);

    boolean existsByProjectIdAndJobIdAndArtifactType(UUID projectId, UUID jobId, String artifactType);

    List<FloorPlanArtifact> findByProjectIdAndJobIdInAndArtifactTypeOrderByCreatedAtDescArtifactIdDesc(
            UUID projectId,
            Collection<UUID> jobIds,
            String artifactType
    );
}
