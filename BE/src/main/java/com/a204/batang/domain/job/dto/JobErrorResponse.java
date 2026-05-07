package com.a204.batang.domain.job.dto;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "작업 또는 작업 단계의 실패 요약 정보")
public record JobErrorResponse(
        @Schema(description = "오류 코드")
        String code,
        @Schema(description = "오류 메시지")
        String message,
        @Schema(description = "재시도 가능 여부")
        Boolean retryable,
        @Schema(description = "추가 질의 가능 여부")
        Boolean clarificationPossible,
        @Schema(description = "상세 오류 정보 저장 URL")
        String detailStorageUrl
) {
}
