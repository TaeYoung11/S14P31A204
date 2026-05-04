package com.a204.batang.domain.floorplan.entity;

import com.a204.batang.domain.floorplan.FloorPlanConstants;
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
 * Floor-plan 생성 결과 산출물을 저장하는 artifact 엔티티이다.
 */
@Entity
@Getter
@Table(name = "artifacts")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FloorPlanArtifact {

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
     * IFC 모델 산출물을 생성한다.
     */
    public static FloorPlanArtifact createIfcModel(
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
        FloorPlanArtifact artifact = new FloorPlanArtifact();
        artifact.artifactId = artifactId;
        artifact.projectId = projectId;
        artifact.revisionId = revisionId;
        artifact.jobId = jobId;
        artifact.artifactType = FloorPlanConstants.ARTIFACT_TYPE_IFC_MODEL;
        artifact.fileName = fileName;
        artifact.mimeType = mimeType;
        artifact.storageUrl = storageUrl;
        artifact.metadataJson = metadataJson;
        artifact.createdAt = now;
        return artifact;
    }

    /**
     * Validation report 산출물을 생성한다.
     */
    public static FloorPlanArtifact createValidationReport(
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
        FloorPlanArtifact artifact = new FloorPlanArtifact();
        artifact.artifactId = artifactId;
        artifact.projectId = projectId;
        artifact.revisionId = revisionId;
        artifact.jobId = jobId;
        artifact.artifactType = FloorPlanConstants.ARTIFACT_TYPE_VALIDATION_REPORT;
        artifact.fileName = fileName;
        artifact.mimeType = mimeType;
        artifact.storageUrl = storageUrl;
        artifact.metadataJson = metadataJson;
        artifact.createdAt = now;
        return artifact;
    }
}
