package com.a204.batang.domain.render.repository;

import com.a204.batang.domain.render.entity.RenderJobStep;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface RenderJobStepRepository extends JpaRepository<RenderJobStep, UUID> {

    Optional<RenderJobStep> findByJobStepIdAndJobId(UUID jobStepId, UUID jobId);

    Optional<RenderJobStep> findByIdempotencyKey(String idempotencyKey);
}
