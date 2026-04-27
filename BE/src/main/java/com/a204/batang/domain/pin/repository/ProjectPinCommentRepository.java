package com.a204.batang.domain.pin.repository;

import com.a204.batang.domain.pin.entity.ProjectPinComment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

/**
 * 핀 댓글 영속성 처리를 담당한다.
 */
public interface ProjectPinCommentRepository extends JpaRepository<ProjectPinComment, UUID> {

    /**
     * 핀에 달린 삭제되지 않은 댓글 목록을 작성 시각 오름차순으로 조회한다.
     *
     * @param pinId 핀 ID
     * @return 댓글 목록
     */
    @Query("""
            SELECT comment
            FROM ProjectPinComment comment
            JOIN comment.projectPin pin
            WHERE pin.pinId = :pinId
              AND comment.deletedAt IS NULL
            ORDER BY comment.createdAt ASC
            """)
    List<ProjectPinComment> findActiveCommentsByPinId(@Param("pinId") UUID pinId);
}
