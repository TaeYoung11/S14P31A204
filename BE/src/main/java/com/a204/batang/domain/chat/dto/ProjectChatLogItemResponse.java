package com.a204.batang.domain.chat.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.UUID;

/**
 * 프로젝트 채팅 로그의 단일 메시지 응답 DTO다.
 *
 * @param type 상위 역할 구분(USER/AI/SYSTEM)
 * @param subType 세부 유형(COMMAND/RESULT/ERROR/QUESTION/ANSWER)
 * @param content 사용자 또는 AI가 표시할 메시지 본문
 * @param senderUserId 사용자 발화인 경우의 발신자 ID
 * @param senderName 사용자 발화인 경우의 발신자 이름
 * @param timestamp 메시지 시각(UTC ISO-8601)
 * @param referenceId 내부 참조 ID. 현재 1단계에서는 jobId와 동일하다.
 * @param jobId 연결된 job ID
 * @param jobType 연결된 job 유형
 * @param jobStatus 조회 시점의 job 상태
 */
@Schema(description = "프로젝트 채팅 로그 메시지")
public record ProjectChatLogItemResponse(
        @Schema(description = "상위 역할 구분", example = "USER")
        String type,
        @Schema(description = "세부 메시지 유형", example = "COMMAND")
        String subType,
        @Schema(description = "메시지 본문", example = "거실 벽을 추가해줘")
        String content,
        @Schema(description = "발신자 사용자 ID", nullable = true)
        UUID senderUserId,
        @Schema(description = "발신자 이름", example = "홍길동", nullable = true)
        String senderName,
        @Schema(description = "메시지 시각 (UTC ISO-8601)", example = "2026-05-07T03:12:00Z")
        String timestamp,
        @Schema(description = "내부 참조 ID", nullable = true)
        UUID referenceId,
        @Schema(description = "연결된 job ID", nullable = true)
        UUID jobId,
        @Schema(description = "연결된 job 유형", example = "TWO_D_TO_IFC_EDIT", nullable = true)
        String jobType,
        @Schema(description = "연결된 job 상태", example = "SUCCEEDED", nullable = true)
        String jobStatus
) {
}
