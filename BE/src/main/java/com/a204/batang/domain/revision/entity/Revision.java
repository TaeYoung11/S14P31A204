package com.a204.batang.domain.revision.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 프로젝트의 IFC 버전 단위를 표현하는 최소 revision 엔티티다.
 */
@Getter
@Entity
@Table(name = "revisions")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Revision {

    private static final String STATUS_CREATING = "CREATING";
    private static final String STATUS_SUCCEEDED = "SUCCEEDED";
    private static final String STATUS_FAILED = "FAILED";

    @Id
    @Column(name = "revision_id", nullable = false, updatable = false)
    private UUID revisionId;

    @Column(name = "project_id", nullable = false)
    private UUID projectId;

    @Column(name = "parent_revision_id")
    private UUID parentRevisionId;

    @Column(name = "revision_no", nullable = false)
    private Integer revisionNo;

    @Column(name = "created_by")
    private UUID createdBy;

    @Column(name = "status", nullable = false, length = 50)
    private String status;

    @Column(name = "title", columnDefinition = "TEXT")
    private String title;

    @Column(name = "summary", columnDefinition = "TEXT")
    private String summary;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    /**
     * creating 상태의 revision을 생성한다.
     */
    public static Revision createCreating(
            UUID revisionId,
            UUID projectId,
            UUID parentRevisionId,
            int revisionNo,
            UUID createdBy,
            String title,
            String summary,
            LocalDateTime createdAt
    ) {
        Revision revision = new Revision();
        revision.revisionId = revisionId;
        revision.projectId = projectId;
        revision.parentRevisionId = parentRevisionId;
        revision.revisionNo = revisionNo;
        revision.createdBy = createdBy;
        revision.status = STATUS_CREATING;
        revision.title = title;
        revision.summary = summary;
        revision.createdAt = createdAt;
        return revision;
    }

    /**
     * revision을 성공 상태로 전이한다.
     */
    public void markSucceeded() {
        this.status = STATUS_SUCCEEDED;
    }

    /**
     * revision을 실패 상태로 전이한다.
     */
    public void markFailed() {
        this.status = STATUS_FAILED;
    }

    /**
     * terminal 상태인지 확인한다.
     */
    public boolean isTerminal() {
        return STATUS_SUCCEEDED.equals(status) || STATUS_FAILED.equals(status);
    }
}
