package com.a204.batang.domain.pin.repository;

import com.a204.batang.domain.pin.entity.ProjectPinComment;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 핀 댓글 영속성 처리를 담당한다.
 */
public interface ProjectPinCommentRepository extends JpaRepository<ProjectPinComment, UUID> {

    /**
     * 핀에 속한 삭제되지 않은 댓글 목록을 페이지 단위로 조회한다.
     *
     * @param pinId 핀 ID
     * @param pageable 페이지 정보
     * @return 댓글 페이지
     */
    @Query("""
            SELECT comment
            FROM ProjectPinComment comment
            WHERE comment.projectPin.pinId = :pinId
              AND comment.deletedAt IS NULL
            """)
    Page<ProjectPinComment> findActiveCommentsByPinId(@Param("pinId") UUID pinId, Pageable pageable);

    /**
     * 현재 사용자 기준 타인 미확인 댓글이 존재하는 핀 ID 목록을 조회한다.
     * Native Query의 IN 바인딩 이슈를 피하기 위해 JPQL + 서브쿼리 방식으로 처리한다.
     *
     * @param pinIds 조회 대상 핀 ID 목록
     * @param userId 사용자 ID
     * @param fallbackReadAt 읽음 상태가 없을 때 사용할 기준 시각
     * @return 타인 미확인 댓글이 존재하는 핀 ID 목록
     */
    @Query("""
            SELECT DISTINCT comment.projectPin.pinId
            FROM ProjectPinComment comment
            WHERE comment.projectPin.pinId IN :pinIds
              AND comment.deletedAt IS NULL
              AND comment.authorUserId IS NOT NULL
              AND comment.authorUserId <> :userId
              AND comment.createdAt > COALESCE(
                  (
                      SELECT readState.lastReadAt
                      FROM PinCommentReadState readState
                      WHERE readState.pinId = comment.projectPin.pinId
                        AND readState.userId = :userId
                  ),
                  :fallbackReadAt
              )
            """)
    List<UUID> findUnreadCommentPinIdsByUser(
            @Param("pinIds") List<UUID> pinIds,
            @Param("userId") UUID userId,
            @Param("fallbackReadAt") LocalDateTime fallbackReadAt
    );

    /**
     * 현재 사용자 기준 타인이 작성한 댓글 개수를 조회한다.
     *
     * @param pinId 핀 ID
     * @param userId 사용자 ID
     * @return 타인 댓글 개수
     */
    @Query("""
            SELECT COUNT(comment)
            FROM ProjectPinComment comment
            WHERE comment.projectPin.pinId = :pinId
              AND comment.deletedAt IS NULL
              AND comment.authorUserId IS NOT NULL
              AND comment.authorUserId <> :userId
            """)
    long countActiveOtherUserComments(
            @Param("pinId") UUID pinId,
            @Param("userId") UUID userId
    );

    /**
     * 현재 사용자 기준 마지막 읽음 시각 이후 작성된 타인 댓글 개수를 조회한다.
     *
     * @param pinId 핀 ID
     * @param userId 사용자 ID
     * @param lastReadAt 마지막 읽음 시각
     * @return 미확인 댓글 개수
     */
    @Query("""
            SELECT COUNT(comment)
            FROM ProjectPinComment comment
            WHERE comment.projectPin.pinId = :pinId
              AND comment.deletedAt IS NULL
              AND comment.authorUserId IS NOT NULL
              AND comment.authorUserId <> :userId
              AND comment.createdAt > :lastReadAt
            """)
    long countUnreadOtherUserComments(
            @Param("pinId") UUID pinId,
            @Param("userId") UUID userId,
            @Param("lastReadAt") LocalDateTime lastReadAt
    );

    /**
     * 현재 사용자 기준 미확인 댓글이 달린 핀 개수를 조회한다.
     *
     * @param projectId 프로젝트 ID
     * @param userId 사용자 ID
     * @param fallbackReadAt 읽음 상태가 없을 때 사용할 기준 시각
     * @return 미확인 댓글이 달린 핀 개수
     */
    @Query("""
            SELECT COUNT(DISTINCT comment.projectPin.pinId)
            FROM ProjectPinComment comment
            WHERE comment.projectPin.project.projectId = :projectId
              AND comment.deletedAt IS NULL
              AND comment.authorUserId IS NOT NULL
              AND comment.authorUserId <> :userId
              AND comment.createdAt > COALESCE(
                  (
                      SELECT readState.lastReadAt
                      FROM PinCommentReadState readState
                      WHERE readState.pinId = comment.projectPin.pinId
                        AND readState.userId = :userId
                  ),
                  :fallbackReadAt
              )
            """)
    long countUnreadCommentPins(
            @Param("projectId") UUID projectId,
            @Param("userId") UUID userId,
            @Param("fallbackReadAt") LocalDateTime fallbackReadAt
    );
}
