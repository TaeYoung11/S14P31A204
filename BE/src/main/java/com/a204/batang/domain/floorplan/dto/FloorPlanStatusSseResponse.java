package com.a204.batang.domain.floorplan.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.UUID;

@Schema(description = "Floor-plan 비동기 상태 SSE payload입니다.")
public record FloorPlanStatusSseResponse(
        @Schema(description = "SSE 이벤트 타입입니다.", example = "FLOOR_PLAN_GENERATE_QUEUED")
        String eventType,
        @Schema(description = "프로젝트 식별자입니다.")
        UUID projectId,
        @Schema(description = "비동기 job 식별자입니다.")
        UUID jobId,
        @Schema(description = "비동기 job step 식별자입니다.")
        UUID jobStepId,
        @Schema(description = "예약된 target revision 식별자입니다.")
        UUID targetRevisionId,
        @Schema(description = "현재 작업 상태입니다.", example = "QUEUED")
        String status,
        @Schema(description = "현재 작업 진행률입니다.", example = "0")
        Integer progress,
        @Schema(description = "선택적인 사용자 노출 메시지입니다.")
        String message
) {
}
