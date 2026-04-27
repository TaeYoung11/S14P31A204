package com.a204.batang.domain.pin.entity;

import com.a204.batang.global.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 핀 댓글 엔티티다.
 */
@Getter
@Entity
@Table(
        name = "comments",
        indexes = {
                @Index(name = "idx_comments_pin_id", columnList = "pin_id"),
                @Index(name = "idx_comments_deleted_at", columnList = "deleted_at")
        }
)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ProjectPinComment extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "comment_id", nullable = false, updatable = false)
    private UUID commentId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "pin_id", nullable = false)
    private ProjectPin projectPin;

    //Todo: user 구현 후 수정 예정
    @Column(name = "author_user_id")
    private UUID authorUserId;

    @Column(name = "content", nullable = false, columnDefinition = "TEXT")
    private String content;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    private ProjectPinComment(ProjectPin projectPin, UUID authorUserId, String content) {
        this.projectPin = projectPin;
        this.authorUserId = authorUserId;
        this.content = content;
    }

    /**
     * 댓글을 생성한다.
     *
     * @param projectPin 대상 핀
     * @param authorUserId 작성자 사용자 ID
     * @param content 댓글 본문
     * @return 생성된 댓글 엔티티
     */
    public static ProjectPinComment create(ProjectPin projectPin, UUID authorUserId, String content) {
        return new ProjectPinComment(projectPin, authorUserId, content);
    }

    /**
     * 댓글을 소프트 삭제한다.
     *
     * @param deletedAt 삭제 시각
     */
    public void softDelete(LocalDateTime deletedAt) {
        this.deletedAt = deletedAt;
    }
}
