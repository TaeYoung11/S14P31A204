package com.a204.batang.domain.render.repository;

import com.a204.batang.domain.render.entity.RenderJob;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * 렌더링 결과 조회용 job repository.
 */
public interface RenderJobRepository extends JpaRepository<RenderJob, UUID> {

    List<RenderJob> findByProjectIdAndJobTypeOrderByCreatedAtDescJobIdDesc(UUID projectId, String jobType);

    Optional<RenderJob> findByJobIdAndProjectId(UUID jobId, UUID projectId);

    Optional<RenderJob> findByJobIdAndProjectIdAndJobType(UUID jobId, UUID projectId, String jobType);

    Optional<RenderJob> findByJobIdAndJobType(UUID jobId, String jobType);
}
