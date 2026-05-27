package com.a204.batang.domain.render.repository;

import com.a204.batang.domain.render.entity.RenderArtifact;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * 렌더링 결과 조회용 artifact repository.
 */
public interface RenderArtifactRepository extends JpaRepository<RenderArtifact, UUID> {

    List<RenderArtifact> findByProjectIdAndJobIdInAndArtifactTypeOrderByCreatedAtDescArtifactIdDesc(
            UUID projectId,
            Collection<UUID> jobIds,
            String artifactType
    );

    Optional<RenderArtifact> findFirstByProjectIdAndJobIdAndArtifactTypeOrderByCreatedAtDescArtifactIdDesc(
            UUID projectId,
            UUID jobId,
            String artifactType
    );

    Optional<RenderArtifact> findByArtifactId(UUID artifactId);
}
