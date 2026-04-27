package com.a204.batang.domain.pin.entity;

import com.a204.batang.global.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 사용자별 핀 댓글 읽음 상태를 저장한다.
 * unread 판단 기준인 마지막 읽음 시각(lastReadAt)을 관리한다.
 */
@Getter
@Entity
@Table(
        name = "pin_comment_read_states",
        indexes = {
                @Index(name = "idx_pin_comment_read_states_user", columnList = "user_id"),
                @Index(name = "idx_pin_comment_read_states_last_read_at", columnList = "last_read_at")
        }
)
@IdClass(PinCommentReadStateId.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PinCommentReadState extends BaseEntity {

    @Id
    @Column(name = "pin_id", nullable = false, updatable = false)
    private UUID pinId;

    @Id
    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "last_read_comment_id")
    private UUID lastReadCommentId;

    @Column(name = "last_read_at", nullable = false)
    private LocalDateTime lastReadAt;

    private PinCommentReadState(
            UUID pinId,
            UUID userId,
            UUID lastReadCommentId,
            LocalDateTime lastReadAt
    ) {
        this.pinId = pinId;
        this.userId = userId;
        this.lastReadCommentId = lastReadCommentId;
        this.lastReadAt = lastReadAt;
    }

    /**
     * 읽음 상태를 최초 생성한다.
     *
     * @param pinId 핀 ID
     * @param userId 사용자 ID
     * @param lastReadCommentId 마지막으로 읽은 댓글 ID
     * @param lastReadAt 마지막 읽음 시각
     * @return 읽음 상태 엔티티
     */
    public static PinCommentReadState create(
            UUID pinId,
            UUID userId,
            UUID lastReadCommentId,
            LocalDateTime lastReadAt
    ) {
        return new PinCommentReadState(pinId, userId, lastReadCommentId, lastReadAt);
    }

    /**
     * 읽음 상태를 최신 시점으로 갱신한다.
     *
     * @param lastReadCommentId 마지막으로 읽은 댓글 ID
     * @param lastReadAt 마지막 읽음 시각
     */
    public void updateLastRead(UUID lastReadCommentId, LocalDateTime lastReadAt) {
        this.lastReadCommentId = lastReadCommentId;
        this.lastReadAt = lastReadAt;
    }
}
