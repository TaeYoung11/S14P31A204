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
 * 렌더링 작업 정보를 저장하는 job 엔티티.
 */
@Entity
@Getter
@Table(name = "jobs")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RenderJob {

    @Id
    @Column(name = "job_id", nullable = false, updatable = false)
    private UUID jobId;

    @Column(name = "project_id", nullable = false)
    private UUID projectId;

    @Column(name = "requested_by")
    private UUID requestedBy;

    @Column(name = "source_scene_state_id")
    private UUID sourceSceneStateId;

    @Column(name = "source_revision_id")
    private UUID sourceRevisionId;

    @Column(name = "source_scene_type", length = 50)
    private String sourceSceneType;

    @Column(name = "job_type", nullable = false, length = 50)
    private String jobType;

    @Column(name = "status", nullable = false, length = 50)
    private String status;

    @Column(name = "progress", nullable = false)
    private Integer progress;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "request_payload", columnDefinition = "jsonb")
    private JsonNode requestPayload;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "result_payload", columnDefinition = "jsonb")
    private JsonNode resultPayload;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "started_at")
    private LocalDateTime startedAt;

    @Column(name = "finished_at")
    private LocalDateTime finishedAt;

    /**
     * 대기 상태의 렌더링 작업을 생성한다.
     */
    public static RenderJob createQueued(
            UUID jobId,
            UUID projectId,
            UUID requestedBy,
            UUID sourceRevisionId,
            String sourceSceneType,
            String jobType,
            JsonNode requestPayload,
            LocalDateTime now
    ) {
        RenderJob job = new RenderJob();
        job.jobId = jobId;
        job.projectId = projectId;
        job.requestedBy = requestedBy;
        job.sourceRevisionId = sourceRevisionId;
        job.sourceSceneType = sourceSceneType;
        job.jobType = jobType;
        job.status = "QUEUED";
        job.progress = 0;
        job.requestPayload = requestPayload;
        job.createdAt = now;
        return job;
    }

    /**
     * 작업을 실행 중 상태로 전이한다.
     */
    public void markRunning(LocalDateTime now) {
        this.status = "RUNNING";
        this.progress = Math.max(progress == null ? 0 : progress, 1);
        if (startedAt == null) {
            startedAt = now;
        }
    }

    /**
     * 진행률을 갱신한다.
     */
    public void updateProgress(Integer progress) {
        if (progress == null) {
            return;
        }
        this.progress = clampProgress(progress);
        if ("QUEUED".equals(status)) {
            status = "RUNNING";
        }
    }

    /**
     * 작업을 성공 상태로 마감한다.
     */
    public void markSucceeded(JsonNode resultPayload, LocalDateTime now) {
        status = "SUCCEEDED";
        progress = 100;
        this.resultPayload = resultPayload;
        errorMessage = null;
        if (startedAt == null) {
            startedAt = now;
        }
        finishedAt = now;
    }

    /**
     * 작업을 실패 상태로 마감한다.
     */
    public void markFailed(String errorMessage, JsonNode resultPayload, LocalDateTime now) {
        status = "FAILED";
        this.resultPayload = resultPayload;
        this.errorMessage = errorMessage;
        if (startedAt == null) {
            startedAt = now;
        }
        finishedAt = now;
    }

    /**
     * 작업이 종료 상태인지 확인한다.
     */
    public boolean isTerminal() {
        return "SUCCEEDED".equals(status) || "FAILED".equals(status) || "CANCELLED".equals(status);
    }

    private int clampProgress(int value) {
        return Math.max(0, Math.min(value, 100));
    }
}
