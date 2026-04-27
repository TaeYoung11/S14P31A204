package com.a204.batang.domain.render.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.Immutable;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 렌더링 결과 조회에 사용하는 artifact 읽기 전용 엔티티.
 */
@Entity
@Getter
@Immutable
@Table(name = "artifacts")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RenderArtifact {

    @Id
    @Column(name = "artifact_id", nullable = false, updatable = false)
    private UUID artifactId;

    @Column(name = "project_id", nullable = false)
    private UUID projectId;

    @Column(name = "job_id", nullable = false)
    private UUID jobId;

    @Column(name = "artifact_type", nullable = false, length = 50)
    private String artifactType;

    @Column(name = "storage_url", nullable = false, length = 2048)
    private String storageUrl;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
