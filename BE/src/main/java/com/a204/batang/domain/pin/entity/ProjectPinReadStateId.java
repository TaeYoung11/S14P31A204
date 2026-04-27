package com.a204.batang.domain.pin.entity;

import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

/**
 * ?꾨줈?앺듃 ? 紐⑸줉 ?쎌쓬 ?곹깭 蹂듯빀 ??projectId, userId)?대떎.
 */
public class ProjectPinReadStateId implements Serializable {

    private UUID projectId;
    private UUID userId;

    public ProjectPinReadStateId() {
    }

    public ProjectPinReadStateId(UUID projectId, UUID userId) {
        this.projectId = projectId;
        this.userId = userId;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof ProjectPinReadStateId that)) {
            return false;
        }
        return Objects.equals(projectId, that.projectId) && Objects.equals(userId, that.userId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(projectId, userId);
    }
}
