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
 * 렌더링 산출물 정보를 저장하는 artifact 엔티티.
 */
@Entity
@Getter
@Table(name = "artifacts")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RenderArtifact {

    @Id
    @Column(name = "artifact_id", nullable = false, updatable = false)
    private UUID artifactId;

    @Column(name = "project_id", nullable = false)
    private UUID projectId;

    @Column(name = "revision_id")
    private UUID revisionId;

    @Column(name = "job_id", nullable = false)
    private UUID jobId;

    @Column(name = "artifact_type", nullable = false, length = 50)
    private String artifactType;

    @Column(name = "file_name", length = 255)
    private String fileName;

    @Column(name = "mime_type", length = 100)
    private String mimeType;

    @Column(name = "storage_url", nullable = false, length = 2048)
    private String storageUrl;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "metadata_json", columnDefinition = "jsonb")
    private JsonNode metadataJson;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    /**
     * 렌더링 완료 이미지 산출물을 생성한다.
     */
    public static RenderArtifact createRenderImage(
            UUID artifactId,
            UUID projectId,
            UUID revisionId,
            UUID jobId,
            String fileName,
            String mimeType,
            String storageUrl,
            JsonNode metadataJson,
            LocalDateTime now
    ) {
        RenderArtifact artifact = new RenderArtifact();
        artifact.artifactId = artifactId;
        artifact.projectId = projectId;
        artifact.revisionId = revisionId;
        artifact.jobId = jobId;
        artifact.artifactType = "RENDER_IMAGE";
        artifact.fileName = fileName;
        artifact.mimeType = mimeType;
        artifact.storageUrl = storageUrl;
        artifact.metadataJson = metadataJson;
        artifact.createdAt = now;
        return artifact;
    }
}
