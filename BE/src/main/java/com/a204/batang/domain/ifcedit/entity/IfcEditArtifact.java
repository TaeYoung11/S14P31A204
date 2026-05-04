package com.a204.batang.domain.ifcedit.entity;

import com.a204.batang.domain.ifcedit.IfcEditConstants;
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

@Entity
@Getter
@Table(name = "artifacts")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class IfcEditArtifact {

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

    public static IfcEditArtifact createIfcModel(
            UUID artifactId,
            UUID projectId,
            UUID revisionId,
            UUID jobId,
            String storageUrl,
            LocalDateTime now
    ) {
        IfcEditArtifact artifact = new IfcEditArtifact();
        artifact.artifactId = artifactId;
        artifact.projectId = projectId;
        artifact.revisionId = revisionId;
        artifact.jobId = jobId;
        artifact.artifactType = IfcEditConstants.ARTIFACT_TYPE_IFC_MODEL;
        artifact.fileName = "model.ifc";
        artifact.mimeType = "application/x-step";
        artifact.storageUrl = storageUrl;
        artifact.createdAt = now;
        return artifact;
    }

    public static IfcEditArtifact createValidationReport(
            UUID artifactId,
            UUID projectId,
            UUID revisionId,
            UUID jobId,
            String storageUrl,
            LocalDateTime now
    ) {
        IfcEditArtifact artifact = new IfcEditArtifact();
        artifact.artifactId = artifactId;
        artifact.projectId = projectId;
        artifact.revisionId = revisionId;
        artifact.jobId = jobId;
        artifact.artifactType = IfcEditConstants.ARTIFACT_TYPE_VALIDATION_REPORT;
        artifact.fileName = "validation-report.json";
        artifact.mimeType = "application/json";
        artifact.storageUrl = storageUrl;
        artifact.createdAt = now;
        return artifact;
    }

    public static IfcEditArtifact createEditPlan(
            UUID artifactId,
            UUID projectId,
            UUID jobId,
            String storageUrl,
            LocalDateTime now
    ) {
        IfcEditArtifact artifact = new IfcEditArtifact();
        artifact.artifactId = artifactId;
        artifact.projectId = projectId;
        artifact.jobId = jobId;
        artifact.artifactType = IfcEditConstants.ARTIFACT_TYPE_EDIT_PLAN;
        artifact.fileName = "edit-plan.json";
        artifact.mimeType = "application/json";
        artifact.storageUrl = storageUrl;
        artifact.createdAt = now;
        return artifact;
    }
}
