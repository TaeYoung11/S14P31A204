package com.a204.batang.domain.render.entity;

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
 * 렌더링 worker 실행 단위를 저장하는 job step 엔티티.
 */
@Entity
@Getter
@Table(name = "job_steps")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RenderJobStep {

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

    @Column(name = "idempotency_key", nullable = false, unique = true, length = 255)
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

    /**
     * 단일 worker step을 대기 상태로 생성한다.
     */
    public static RenderJobStep createQueued(
            UUID jobStepId,
            UUID jobId,
            Integer stepNo,
            String workerType,
            String commandRoutingKey,
            String idempotencyKey,
            JsonNode inputPayload,
            LocalDateTime now
    ) {
        RenderJobStep step = new RenderJobStep();
        step.jobStepId = jobStepId;
        step.jobId = jobId;
        step.stepNo = stepNo;
        step.workerType = workerType;
        step.commandRoutingKey = commandRoutingKey;
        step.status = "QUEUED";
        step.progress = 0;
        step.attemptCount = 0;
        step.idempotencyKey = idempotencyKey;
        step.inputPayload = inputPayload;
        step.createdAt = now;
        return step;
    }

    public void markRunning(LocalDateTime now) {
        status = "RUNNING";
        progress = Math.max(progress == null ? 0 : progress, 1);
        if (startedAt == null) {
            startedAt = now;
        }
    }

    public void updateProgress(Integer progress) {
        if (progress == null) {
            return;
        }
        this.progress = Math.max(0, Math.min(progress, 100));
        if ("QUEUED".equals(status)) {
            status = "RUNNING";
        }
    }

    /**
     * worker output payload를 저장하고 step을 성공 상태로 마감한다.
     */
    public void markSucceeded(JsonNode outputPayload, LocalDateTime now) {
        status = "SUCCEEDED";
        progress = 100;
        this.outputPayload = outputPayload;
        errorCode = null;
        errorMessage = null;
        if (startedAt == null) {
            startedAt = now;
        }
        finishedAt = now;
    }

    /**
     * worker error 정보를 저장하고 step을 실패 상태로 마감한다.
     */
    public void markFailed(String errorCode, String errorMessage, JsonNode outputPayload, LocalDateTime now) {
        status = "FAILED";
        this.outputPayload = outputPayload;
        this.errorCode = errorCode;
        this.errorMessage = errorMessage;
        if (startedAt == null) {
            startedAt = now;
        }
        finishedAt = now;
    }

    public boolean isTerminal() {
        return "SUCCEEDED".equals(status) || "FAILED".equals(status) || "CANCELLED".equals(status);
    }
}
