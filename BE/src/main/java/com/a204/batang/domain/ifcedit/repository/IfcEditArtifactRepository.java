package com.a204.batang.domain.ifcedit.repository;

import com.a204.batang.domain.ifcedit.entity.IfcEditArtifact;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface IfcEditArtifactRepository extends JpaRepository<IfcEditArtifact, UUID> {

    Optional<IfcEditArtifact> findByArtifactId(UUID artifactId);

    boolean existsByProjectIdAndJobIdAndArtifactType(UUID projectId, UUID jobId, String artifactType);
}
