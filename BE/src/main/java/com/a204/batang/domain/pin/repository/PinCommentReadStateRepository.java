package com.a204.batang.domain.pin.repository;

import com.a204.batang.domain.pin.entity.PinCommentReadState;
import com.a204.batang.domain.pin.entity.PinCommentReadStateId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

/**
 * 사용자별 핀 댓글 읽음 상태 영속성을 담당한다.
 */
public interface PinCommentReadStateRepository extends JpaRepository<PinCommentReadState, PinCommentReadStateId> {

    /**
     * 핀과 사용자에 해당하는 읽음 상태를 조회한다.
     *
     * @param pinId 핀 ID
     * @param userId 사용자 ID
     * @return 읽음 상태
     */
    Optional<PinCommentReadState> findByPinIdAndUserId(UUID pinId, UUID userId);

    /**
     * 사용자별 읽음 상태를 UPSERT로 저장한다.
     * 동시 요청에서도 유니크 충돌 없이 마지막 읽음 상태를 원자적으로 갱신한다.
     *
     * @param pinId 핀 ID
     * @param userId 사용자 ID
     * @param lastReadCommentId 마지막으로 읽은 댓글 ID
     * @param lastReadAt 마지막 읽음 시각
     * @param now 생성/수정 시각
     */
    @Modifying
    @Query(
            value = """
                    INSERT INTO pin_comment_read_states (
                        pin_id,
                        user_id,
                        last_read_comment_id,
                        last_read_at,
                        created_at,
                        updated_at
                    ) VALUES (
                        :pinId,
                        :userId,
                        :lastReadCommentId,
                        :lastReadAt,
                        :now,
                        :now
                    )
                    ON CONFLICT (pin_id, user_id)
                    DO UPDATE SET
                        last_read_comment_id = EXCLUDED.last_read_comment_id,
                        last_read_at = EXCLUDED.last_read_at,
                        updated_at = EXCLUDED.updated_at
                    """,
            nativeQuery = true
    )
    void upsertLastReadState(
            @Param("pinId") UUID pinId,
            @Param("userId") UUID userId,
            @Param("lastReadCommentId") UUID lastReadCommentId,
            @Param("lastReadAt") LocalDateTime lastReadAt,
            @Param("now") LocalDateTime now
    );
}
