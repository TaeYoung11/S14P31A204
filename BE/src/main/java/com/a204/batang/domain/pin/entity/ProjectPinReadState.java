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
 * 사용자별 프로젝트 핀 목록 읽음 상태를 저장한다.
 * unread 핀 판단 기준인 마지막 읽음 시각(lastReadAt)을 관리한다.
 */
@Getter
@Entity
@Table(
        name = "project_pin_read_states",
        indexes = {
                @Index(name = "idx_project_pin_read_states_user", columnList = "user_id"),
                @Index(name = "idx_project_pin_read_states_last_read_at", columnList = "last_read_at")
        }
)
@IdClass(ProjectPinReadStateId.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ProjectPinReadState extends BaseEntity {

    @Id
    @Column(name = "project_id", nullable = false, updatable = false)
    private UUID projectId;

    @Id
    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "last_read_at", nullable = false)
    private LocalDateTime lastReadAt;

    private ProjectPinReadState(UUID projectId, UUID userId, LocalDateTime lastReadAt) {
        this.projectId = projectId;
        this.userId = userId;
        this.lastReadAt = lastReadAt;
    }

    /**
     * 읽음 상태를 최초 생성한다.
     *
     * @param projectId 프로젝트 ID
     * @param userId 사용자 ID
     * @param lastReadAt 마지막 읽음 시각
     * @return 읽음 상태 엔티티
     */
    public static ProjectPinReadState create(UUID projectId, UUID userId, LocalDateTime lastReadAt) {
        return new ProjectPinReadState(projectId, userId, lastReadAt);
    }

    /**
     * 읽음 상태를 최신 시점으로 갱신한다.
     *
     * @param lastReadAt 마지막 읽음 시각
     */
    public void updateLastReadAt(LocalDateTime lastReadAt) {
        this.lastReadAt = lastReadAt;
    }
}
