package com.a204.batang.domain.pin.entity;

import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.global.common.entity.BaseEntity;
import jakarta.persistence.AttributeOverride;
import jakarta.persistence.AttributeOverrides;
import jakarta.persistence.Column;
import jakarta.persistence.Embedded;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 프로젝트 리뷰 핀 엔티티다.
 * 핀 자체의 본문과 댓글 메타데이터(최근 댓글 작성자/시각, 댓글 수)를 함께 보관한다.
 */
@Getter
@Entity
@Table(
        name = "project_pins",
        indexes = {
                @Index(name = "idx_project_pins_project_id", columnList = "project_id"),
                @Index(name = "idx_project_pins_deleted_at", columnList = "deleted_at")
        }
)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ProjectPin extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "pin_id", nullable = false, updatable = false)
    private UUID pinId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;


    //Todo: user 구현 후 수정 예정
    @Column(name = "author_user_id")
    private UUID authorUserId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private PinStatus status;

    @Embedded
    @AttributeOverrides({
            @AttributeOverride(name = "x", column = @Column(name = "camera_x", nullable = false)),
            @AttributeOverride(name = "y", column = @Column(name = "camera_y", nullable = false)),
            @AttributeOverride(name = "z", column = @Column(name = "camera_z", nullable = false))
    })
    private PinPosition cameraPosition;

    @Embedded
    @AttributeOverrides({
            @AttributeOverride(name = "x", column = @Column(name = "world_x", nullable = false)),
            @AttributeOverride(name = "y", column = @Column(name = "world_y", nullable = false)),
            @AttributeOverride(name = "z", column = @Column(name = "world_z", nullable = false))
    })
    private PinPosition worldPosition;

    @Column(name = "target_element_id", nullable = false, length = 100)
    private String targetElementId;

    @Column(name = "content", nullable = false, columnDefinition = "TEXT")
    private String content;

    /**
     * 핀 스레드의 전체 댓글 수다.
     * 현재는 핀 생성 본문을 1건으로 시작한다.
     */
    @Column(name = "comment_count", nullable = false)
    private Integer commentCount;

    /**
     * 마지막 댓글(또는 핀 본문) 작성 시각이다.
     */
    @Column(name = "last_comment_at", nullable = false)
    private LocalDateTime lastCommentAt;

    /**
     * 마지막 댓글 작성자 사용자 ID다.
     */
    @Column(name = "last_comment_author_user_id")
    private UUID lastCommentAuthorUserId;

    /**
     * 핀 해결 처리자 사용자 ID다.
     */
    @Column(name = "resolved_by_user_id")
    private UUID resolvedByUserId;

    /**
     * 핀 해결 처리 시각이다.
     */
    @Column(name = "resolved_at")
    private LocalDateTime resolvedAt;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    /**
     * 댓글 메타데이터 갱신 시 동시성 충돌 감지를 위한 버전 값이다.
     */
    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    private ProjectPin(
            Project project,
            UUID authorUserId,
            PinPosition cameraPosition,
            PinPosition worldPosition,
            String targetElementId,
            String content,
            LocalDateTime createdAt
    ) {
        this.project = project;
        this.authorUserId = authorUserId;
        this.status = PinStatus.OPEN;
        this.cameraPosition = cameraPosition;
        this.worldPosition = worldPosition;
        this.targetElementId = targetElementId;
        this.content = content;
        this.commentCount = 1;
        this.lastCommentAt = createdAt;
        this.lastCommentAuthorUserId = authorUserId;
    }

    /**
     * 새 핀을 생성한다.
     *
     * @param project 프로젝트
     * @param authorUserId 작성자 사용자 ID
     * @param cameraPosition 카메라 좌표
     * @param worldPosition 월드 좌표
     * @param targetElementId 대상 엘리먼트 ID
     * @param content 코멘트 본문
     * @return 생성된 핀 엔티티
     */
    public static ProjectPin create(
            Project project,
            UUID authorUserId,
            PinPosition cameraPosition,
            PinPosition worldPosition,
            String targetElementId,
            String content
    ) {
        return new ProjectPin(
                project,
                authorUserId,
                cameraPosition,
                worldPosition,
                targetElementId,
                content,
                LocalDateTime.now()
        );
    }

    /**
     * 핀 상태를 해결됨으로 변경한다.
     *
     * @param resolverUserId 해결 처리 사용자 ID
     */
    public void markResolved(UUID resolverUserId) {
        this.status = PinStatus.RESOLVED;
        this.resolvedByUserId = resolverUserId;
        this.resolvedAt = LocalDateTime.now();
    }

    /**
     * 댓글 등록 이벤트 메타데이터를 반영한다.
     * 댓글 테이블 도입 후 댓글 생성 시점에 호출할 수 있다.
     *
     * @param commenterUserId 댓글 작성자 사용자 ID
     */
    public void recordComment(UUID commenterUserId) {
        this.commentCount = this.commentCount + 1;
        this.lastCommentAuthorUserId = commenterUserId;
        this.lastCommentAt = LocalDateTime.now();
    }

    /**
     * 댓글 메타데이터를 현재 상태에 맞게 갱신한다.
     *
     * @param commentCount 반영할 전체 댓글 수(핀 본문 포함)
     * @param lastCommentAt 마지막 댓글 시각
     * @param lastCommentAuthorUserId 마지막 댓글 작성자 ID
     */
    public void updateCommentSummary(int commentCount, LocalDateTime lastCommentAt, UUID lastCommentAuthorUserId) {
        this.commentCount = commentCount;
        this.lastCommentAt = lastCommentAt;
        this.lastCommentAuthorUserId = lastCommentAuthorUserId;
    }

    /**
     * 핀을 논리 삭제한다.
     *
     * @param deletedAt 삭제 시각
     */
    public void softDelete(LocalDateTime deletedAt) {
        this.deletedAt = deletedAt;
    }
}
