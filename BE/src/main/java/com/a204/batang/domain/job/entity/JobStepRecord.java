package com.a204.batang.domain.job.entity;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 공통 작업 상태 조회 API에서 사용하는 읽기 전용 job step 엔티티다.
 */
@Entity
@Getter
@Table(name = "job_steps")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class JobStepRecord {

    @Id
    @Column(name = "job_step_id", nullable = false, updatable = false)
    private UUID jobStepId;

    @Column(name = "job_id", nullable = false)
    private UUID jobId;

    @Column(name = "step_no", nullable = false)
    private Integer stepNo;

    @Column(name = "worker_type", nullable = false, length = 50)
    private String workerType;

    @Column(name = "command_routing_key", nullable = false, length = 100)
    private String commandRoutingKey;

    @Column(name = "status", nullable = false, length = 50)
    private String status;

    @Column(name = "progress", nullable = false)
    private Integer progress;

    @Column(name = "attempt_count", nullable = false)
    private Integer attemptCount;

    @Column(name = "idempotency_key", nullable = false, length = 255)
    private String idempotencyKey;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "input_payload", columnDefinition = "jsonb")
    private JsonNode inputPayload;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "output_payload", columnDefinition = "jsonb")
    private JsonNode outputPayload;

    @Column(name = "error_code", columnDefinition = "TEXT")
    private String errorCode;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "started_at")
    private LocalDateTime startedAt;

    @Column(name = "finished_at")
    private LocalDateTime finishedAt;

    public boolean isTerminal() {
        return "SUCCEEDED".equals(status) || "FAILED".equals(status) || "CANCELLED".equals(status);
    }
}
