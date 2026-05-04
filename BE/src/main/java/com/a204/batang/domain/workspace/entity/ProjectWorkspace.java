package com.a204.batang.domain.workspace.entity;

import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.global.common.entity.BaseEntity;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.MapsId;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.Objects;
import java.util.UUID;

/**
 * 프로젝트의 버블/IFC 편집 상태와 최신 산출물을 관리하는 통합 워크스페이스 엔티티다.
 */
@Getter
@Entity
@Table(name = "project_workspaces")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ProjectWorkspace extends BaseEntity {

    @Id
    @Column(name = "project_id", nullable = false, updatable = false)
    private UUID projectId;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @MapsId
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @Enumerated(EnumType.STRING)
    @Column(name = "phase_status", nullable = false, length = 30)
    private PhaseStatus phaseStatus;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "bubble_snapshot_json", columnDefinition = "jsonb")
    private JsonNode bubbleSnapshotJson;

    @Column(name = "ifc_storage_url", length = 2048)
    private String ifcStorageUrl;

    @Column(name = "current_revision", length = 50)
    private String currentRevision;

    private ProjectWorkspace(Project project) {
        this.project = project;
        this.phaseStatus = PhaseStatus.BUBBLE_DRAFT;
    }

    /**
     * 프로젝트 워크스페이스를 생성한다.
     *
     * @param project 대상 프로젝트
     * @return 초기 워크스페이스 엔티티
     */
    public static ProjectWorkspace create(Project project) {
        return new ProjectWorkspace(project);
    }

    /**
     * 버블 다이어그램 스냅샷을 최신값으로 갱신한다.
     *
     * @param bubbleSnapshotJson 버블 스냅샷 JSON
     */
    public void updateBubbleSnapshot(JsonNode bubbleSnapshotJson) {
        this.bubbleSnapshotJson = bubbleSnapshotJson;
    }

    /**
     * 최신 IFC storage 경로를 갱신한다.
     *
     * @param ifcStorageUrl 최신 IFC storage URL
     */
    public void updateIfcStorageUrl(String ifcStorageUrl) {
        this.ifcStorageUrl = ifcStorageUrl;
    }

    /**
     * 현재 revision 식별자를 UUID 문자열로 갱신한다.
     *
     * @param revisionId 최신 revision ID
     */
    public void updateCurrentRevision(UUID revisionId) {
        this.currentRevision = Objects.requireNonNull(revisionId, "revisionId must not be null").toString();
    }

    /**
     * 최신 IFC 출력 정보와 revision 식별자를 함께 갱신한다.
     *
     * @param ifcStorageUrl 최신 IFC storage URL
     * @param revisionId 최신 revision ID
     */
    public void updateIfcOutput(String ifcStorageUrl, UUID revisionId) {
        updateIfcStorageUrl(ifcStorageUrl);
        updateCurrentRevision(revisionId);
    }
}
