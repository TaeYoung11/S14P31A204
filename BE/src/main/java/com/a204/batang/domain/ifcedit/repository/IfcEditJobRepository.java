package com.a204.batang.domain.ifcedit.repository;

import com.a204.batang.domain.ifcedit.entity.IfcEditJob;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.Optional;
import java.util.UUID;

public interface IfcEditJobRepository extends JpaRepository<IfcEditJob, UUID> {

    Optional<IfcEditJob> findByJobId(UUID jobId);

    Optional<IfcEditJob> findByJobIdAndJobType(UUID jobId, String jobType);

    boolean existsByProjectIdAndJobTypeInAndStatusIn(UUID projectId, Collection<String> jobTypes, Collection<String> statuses);
}
