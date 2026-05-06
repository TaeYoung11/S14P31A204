package com.a204.batang.domain.ifcedit.repository;

import com.a204.batang.domain.ifcedit.entity.IfcEditJobStep;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface IfcEditJobStepRepository extends JpaRepository<IfcEditJobStep, UUID> {

    Optional<IfcEditJobStep> findByJobStepIdAndJobId(UUID jobStepId, UUID jobId);

    Optional<IfcEditJobStep> findByIdempotencyKey(String idempotencyKey);

    Optional<IfcEditJobStep> findByJobIdAndStepNo(UUID jobId, Integer stepNo);
}
