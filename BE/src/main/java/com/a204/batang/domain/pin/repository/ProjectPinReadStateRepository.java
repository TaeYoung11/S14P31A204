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
 * ?ъ슜?먮퀎 ?꾨줈?앺듃 ? 紐⑸줉 ?쎌쓬 ?곹깭 ?곸냽?깆쓣 ?대떦?쒕떎.
 */
public interface ProjectPinReadStateRepository extends JpaRepository<ProjectPinReadState, ProjectPinReadStateId> {

    /**
     * ?꾨줈?앺듃? ?ъ슜?먯뿉 ?대떦?섎뒗 ?쎌쓬 ?곹깭瑜?議고쉶?쒕떎.
     *
     * @param projectId ?꾨줈?앺듃 ID
     * @param userId ?ъ슜??ID
     * @return ?쎌쓬 ?곹깭
     */
    Optional<ProjectPinReadState> findByProjectIdAndUserId(UUID projectId, UUID userId);

    /**
     * ?ъ슜?먮퀎 ?꾨줈?앺듃 ? 紐⑸줉 ?쎌쓬 ?곹깭瑜?UPSERT濡???ν븳??
     * ?숈떆 ?붿껌?먯꽌??異⑸룎 ?놁씠 留덉?留??쎌쓬 ?쒓컖???먯옄?곸쑝濡?媛깆떊?쒕떎.
     *
     * @param projectId ?꾨줈?앺듃 ID
     * @param userId ?ъ슜??ID
     * @param lastReadAt 留덉?留??쎌쓬 ?쒓컖
     * @param now ?앹꽦/?섏젙 ?쒓컖
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
