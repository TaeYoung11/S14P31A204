package com.a204.batang.domain.job.repository;

import com.a204.batang.domain.job.entity.JobStepRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface JobStepRecordRepository extends JpaRepository<JobStepRecord, UUID> {

    List<JobStepRecord> findByJobIdOrderByStepNoAsc(UUID jobId);
}
