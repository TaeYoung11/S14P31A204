package com.a204.batang.domain.job.repository;

import com.a204.batang.domain.job.entity.JobArtifactRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface JobArtifactRecordRepository extends JpaRepository<JobArtifactRecord, UUID> {

    List<JobArtifactRecord> findByJobIdOrderByCreatedAtAscArtifactIdAsc(UUID jobId);
}
