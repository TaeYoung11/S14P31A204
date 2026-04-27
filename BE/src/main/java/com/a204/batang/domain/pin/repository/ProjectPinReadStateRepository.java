package com.a204.batang.domain.pin.repository;

import com.a204.batang.domain.pin.entity.ProjectPinReadState;
import com.a204.batang.domain.pin.entity.ProjectPinReadStateId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

/**
 * 사용자별 프로젝트 핀 목록 읽음 상태 영속성을 담당한다.
 */
public interface ProjectPinReadStateRepository extends JpaRepository<ProjectPinReadState, ProjectPinReadStateId> {

    /**
     * 프로젝트와 사용자에 해당하는 읽음 상태를 조회한다.
     *
     * @param projectId 프로젝트 ID
     * @param userId 사용자 ID
     * @return 읽음 상태
     */
    Optional<ProjectPinReadState> findByProjectIdAndUserId(UUID projectId, UUID userId);

    /**
     * 사용자별 프로젝트 핀 목록 읽음 상태를 UPSERT로 저장한다.
     * 동시 요청에서도 충돌 없이 마지막 읽음 시각을 원자적으로 갱신한다.
     *
     * @param projectId 프로젝트 ID
     * @param userId 사용자 ID
     * @param lastReadAt 마지막 읽음 시각
     * @param now 생성/수정 시각
     */
    @Modifying
    @Query(
            value = """
                    INSERT INTO project_pin_read_states (
                        project_id,
                        user_id,
                        last_read_at,
                        created_at,
                        updated_at
                    ) VALUES (
                        :projectId,
                        :userId,
                        :lastReadAt,
                        :now,
                        :now
                    )
                    ON CONFLICT (project_id, user_id)
                    DO UPDATE SET
                        last_read_at = EXCLUDED.last_read_at,
                        updated_at = EXCLUDED.updated_at
                    """,
            nativeQuery = true
    )
    void upsertLastReadState(
            @Param("projectId") UUID projectId,
            @Param("userId") UUID userId,
            @Param("lastReadAt") LocalDateTime lastReadAt,
            @Param("now") LocalDateTime now
    );
}
