package com.a204.batang.domain.pin.repository;

import com.a204.batang.domain.pin.entity.PinStatus;
import com.a204.batang.domain.pin.entity.ProjectPin;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

/**
 * 프로젝트 핀 영속성 처리를 담당한다.
 */
public interface ProjectPinRepository extends JpaRepository<ProjectPin, UUID> {

    /**
     * 프로젝트에 속한 삭제되지 않은 핀 목록을 페이지 단위로 조회한다.
     *
     * @param projectId 프로젝트 ID
     * @param pageable 페이지 정보
     * @return 핀 페이지
     */
    @Query("""
            SELECT pin
            FROM ProjectPin pin
            WHERE pin.project.projectId = :projectId
              AND pin.deletedAt IS NULL
              AND pin.status <> :resolvedStatus
            """)
    Page<ProjectPin> findActivePinsByProjectId(
            @Param("projectId") UUID projectId,
            @Param("resolvedStatus") PinStatus resolvedStatus,
            Pageable pageable
    );

    /**
     * 현재 사용자 기준 타인이 작성한 핀 개수를 조회한다.
     *
     * @param projectId 프로젝트 ID
     * @param currentUserId 현재 사용자 ID
     * @return 타인 작성 핀 개수
     */
    @Query("""
            SELECT COUNT(pin)
            FROM ProjectPin pin
            WHERE pin.project.projectId = :projectId
              AND pin.deletedAt IS NULL
              AND pin.status <> :resolvedStatus
              AND pin.authorUserId IS NOT NULL
              AND pin.authorUserId <> :currentUserId
            """)
    long countActiveOtherUserPins(
            @Param("projectId") UUID projectId,
            @Param("currentUserId") UUID currentUserId,
            @Param("resolvedStatus") PinStatus resolvedStatus
    );

    /**
     * 현재 사용자 기준 마지막 읽음 시각 이후 생성된 타인 핀 개수를 조회한다.
     *
     * @param projectId 프로젝트 ID
     * @param currentUserId 현재 사용자 ID
     * @param lastReadAt 마지막 읽음 시각
     * @return 미확인 핀 개수
     */
    @Query("""
            SELECT COUNT(pin)
            FROM ProjectPin pin
            WHERE pin.project.projectId = :projectId
              AND pin.deletedAt IS NULL
              AND pin.status <> :resolvedStatus
              AND pin.authorUserId IS NOT NULL
              AND pin.authorUserId <> :currentUserId
              AND pin.createdAt > :lastReadAt
            """)
    long countUnreadOtherUserPins(
            @Param("projectId") UUID projectId,
            @Param("currentUserId") UUID currentUserId,
            @Param("lastReadAt") LocalDateTime lastReadAt,
            @Param("resolvedStatus") PinStatus resolvedStatus
    );

    /**
     * 프로젝트에 속한 활성 핀을 단건 조회한다.
     *
     * @param pinId 핀 ID
     * @param projectId 프로젝트 ID
     * @return 조회 결과
     */
    @Query("""
            SELECT pin
            FROM ProjectPin pin
            JOIN FETCH pin.project project
            WHERE pin.pinId = :pinId
              AND project.projectId = :projectId
              AND pin.deletedAt IS NULL
            """)
    Optional<ProjectPin> findActivePinByProjectId(
            @Param("pinId") UUID pinId,
            @Param("projectId") UUID projectId
    );
}
