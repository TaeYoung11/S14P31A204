package com.a204.batang.domain.pin.entity;

import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

/**
 * 핀 댓글 읽음 상태 복합 키(pinId, userId)이다.
 */
public class PinCommentReadStateId implements Serializable {

    private UUID pinId;
    private UUID userId;

    public PinCommentReadStateId() {
    }

    public PinCommentReadStateId(UUID pinId, UUID userId) {
        this.pinId = pinId;
        this.userId = userId;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof PinCommentReadStateId that)) {
            return false;
        }
        return Objects.equals(pinId, that.pinId) && Objects.equals(userId, that.userId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(pinId, userId);
    }
}
