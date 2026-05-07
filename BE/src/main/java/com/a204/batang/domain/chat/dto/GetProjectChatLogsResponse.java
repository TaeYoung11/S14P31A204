package com.a204.batang.domain.chat.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;
import java.util.UUID;

/**
 * 프로젝트 채팅 로그 페이지 응답 DTO다.
 *
 * <p>이 API는 0-base 페이지 규칙을 사용한다. DB에서는 최신순으로 조회하지만,
 * 같은 페이지 내부의 메시지는 FE 렌더 편의를 위해 시간 오름차순으로 되돌려 반환한다.
 *
 * @param projectId 프로젝트 ID
 * @param page 현재 페이지(0-base)
 * @param size 페이지 크기
 * @param totalElements 전체 메시지 개수
 * @param totalPages 전체 페이지 수
 * @param hasNext 다음 페이지 존재 여부
 * @param messages 메시지 목록
 */
@Schema(description = "프로젝트 채팅 로그 페이지 응답")
public record GetProjectChatLogsResponse(
        @Schema(description = "프로젝트 ID")
        UUID projectId,
        @Schema(description = "현재 페이지(0-base)", example = "0")
        int page,
        @Schema(description = "페이지 크기", example = "50")
        int size,
        @Schema(description = "전체 메시지 개수", example = "132")
        long totalElements,
        @Schema(description = "전체 페이지 수", example = "3")
        int totalPages,
        @Schema(description = "다음 페이지 존재 여부", example = "true")
        boolean hasNext,
        @Schema(description = "메시지 목록")
        List<ProjectChatLogItemResponse> messages
) {

    public static GetProjectChatLogsResponse of(
            UUID projectId,
            int page,
            int size,
            long totalElements,
            int totalPages,
            boolean hasNext,
            List<ProjectChatLogItemResponse> messages
    ) {
        return new GetProjectChatLogsResponse(
                projectId,
                page,
                size,
                totalElements,
                totalPages,
                hasNext,
                List.copyOf(messages)
        );
    }
}
