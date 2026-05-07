package com.a204.batang.domain.job.repository;

import com.a204.batang.domain.job.entity.JobRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface JobRecordRepository extends JpaRepository<JobRecord, UUID> {
}
