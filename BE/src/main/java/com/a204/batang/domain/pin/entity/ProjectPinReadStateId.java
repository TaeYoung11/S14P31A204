package com.a204.batang.domain.pin.entity;

import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

/**
 * 프로젝트 핀 목록 읽음 상태 복합 키(projectId, userId)이다.
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
