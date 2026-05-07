package com.a204.batang.domain.chat.repository;

import com.a204.batang.domain.ifcedit.entity.IfcEditJob;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

/**
 * 프로젝트 채팅 로그 가상 조회용 Repository다.
 *
 * <p>현재 1단계에서는 jobs 테이블만 이용해 USER_COMMAND / ASSISTANT_RESULT / ASSISTANT_ERROR를
 * 가상 메시지로 재구성한다. clarification_requests가 실제 repo에 도입되면 동일 CTE에
 * UNION ALL을 추가하는 방식으로 확장한다.
 */
public interface ProjectChatLogRepository extends Repository<IfcEditJob, UUID> {

    /**
     * 프로젝트의 가상 채팅 로그를 최신순으로 조회한다.
     *
     * <p>Pageable 정렬은 사용하지 않고, 쿼리 내부 ORDER BY를 기준으로 페이지를 구성한다.
     * 같은 페이지 내부의 메시지 순서는 service 계층에서 뒤집어 FE 친화적인 오름차순으로 반환한다.
     *
     * @param projectId 프로젝트 ID
     * @param pageable 페이지 정보
     * @return 최신순 가상 채팅 로그 페이지
     */
    @Query(
            value = """
                    WITH virtual_chat_logs AS (
                        SELECT
                            j.job_id AS reference_id,
                            'USER' AS type,
                            'COMMAND' AS sub_type,
                            COALESCE(j.request_payload ->> 'message', j.request_payload ->> 'user_instruction') AS content,
                            j.requested_by AS sender_user_id,
                            j.job_id AS job_id,
                            j.job_type AS job_type,
                            j.status AS job_status,
                            j.created_at AS timestamp
                        FROM jobs j
                        WHERE j.project_id = :projectId
                          AND j.job_type IN ('TWO_D_TO_IFC_EDIT', 'THREE_D_TO_IFC_EDIT')
                          AND COALESCE(j.request_payload ->> 'message', j.request_payload ->> 'user_instruction') IS NOT NULL

                        UNION ALL

                        SELECT
                            j.job_id AS reference_id,
                            'AI' AS type,
                            'RESULT' AS sub_type,
                            COALESCE(j.result_payload ->> 'message', 'IFC 편집 작업이 완료되었습니다.') AS content,
                            NULL AS sender_user_id,
                            j.job_id AS job_id,
                            j.job_type AS job_type,
                            j.status AS job_status,
                            j.finished_at AS timestamp
                        FROM jobs j
                        WHERE j.project_id = :projectId
                          AND j.job_type IN ('TWO_D_TO_IFC_EDIT', 'THREE_D_TO_IFC_EDIT')
                          AND j.status = 'SUCCEEDED'
                          AND j.finished_at IS NOT NULL

                        UNION ALL

                        SELECT
                            j.job_id AS reference_id,
                            'AI' AS type,
                            'ERROR' AS sub_type,
                            COALESCE(j.error_message, 'IFC 편집 작업이 실패했습니다.') AS content,
                            NULL AS sender_user_id,
                            j.job_id AS job_id,
                            j.job_type AS job_type,
                            j.status AS job_status,
                            j.finished_at AS timestamp
                        FROM jobs j
                        WHERE j.project_id = :projectId
                          AND j.job_type IN ('TWO_D_TO_IFC_EDIT', 'THREE_D_TO_IFC_EDIT')
                          AND j.status = 'FAILED'
                          AND j.finished_at IS NOT NULL
                    )
                    SELECT
                        reference_id,
                        type,
                        sub_type,
                        content,
                        sender_user_id,
                        job_id,
                        job_type,
                        job_status,
                        timestamp
                    FROM virtual_chat_logs
                    ORDER BY timestamp DESC, reference_id DESC
                    """,
            countQuery = """
                    WITH virtual_chat_logs AS (
                        SELECT
                            j.job_id AS reference_id,
                            COALESCE(j.request_payload ->> 'message', j.request_payload ->> 'user_instruction') AS content,
                            j.created_at AS timestamp
                        FROM jobs j
                        WHERE j.project_id = :projectId
                          AND j.job_type IN ('TWO_D_TO_IFC_EDIT', 'THREE_D_TO_IFC_EDIT')
                          AND COALESCE(j.request_payload ->> 'message', j.request_payload ->> 'user_instruction') IS NOT NULL

                        UNION ALL

                        SELECT
                            j.job_id AS reference_id,
                            COALESCE(j.result_payload ->> 'message', 'IFC 편집 작업이 완료되었습니다.') AS content,
                            j.finished_at AS timestamp
                        FROM jobs j
                        WHERE j.project_id = :projectId
                          AND j.job_type IN ('TWO_D_TO_IFC_EDIT', 'THREE_D_TO_IFC_EDIT')
                          AND j.status = 'SUCCEEDED'
                          AND j.finished_at IS NOT NULL

                        UNION ALL

                        SELECT
                            j.job_id AS reference_id,
                            COALESCE(j.error_message, 'IFC 편집 작업이 실패했습니다.') AS content,
                            j.finished_at AS timestamp
                        FROM jobs j
                        WHERE j.project_id = :projectId
                          AND j.job_type IN ('TWO_D_TO_IFC_EDIT', 'THREE_D_TO_IFC_EDIT')
                          AND j.status = 'FAILED'
                          AND j.finished_at IS NOT NULL
                    )
                    SELECT COUNT(*)
                    FROM virtual_chat_logs
                    """,
            nativeQuery = true
    )
    Page<Object[]> findVirtualChatLogsByProjectId(@Param("projectId") UUID projectId, Pageable pageable);
}
