package com.a204.batang.domain.ifcedit.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.UUID;

@Schema(description = "IFC 편집 작업 등록 응답입니다.")
public record IfcEditJobResponse(
        @Schema(description = "프로젝트 식별자입니다.")
        UUID projectId,

        @Schema(description = "비동기 IFC 편집 작업에 예약된 job 식별자입니다.")
        UUID jobId,

        @Schema(description = "worker command에 예약된 job step 식별자입니다.")
        UUID jobStepId,

        @Schema(description = "worker 실행 전에 예약된 target revision 식별자입니다. LLM 경유 경로의 첫 step에서는 null입니다.")
        UUID targetRevisionId,

        @Schema(description = "생성될 IFC 산출물에 예약된 artifact 식별자입니다. LLM 경유 경로의 첫 step에서는 null입니다.")
        UUID expectedOutputArtifactId,

        @Schema(description = "job 유형입니다.", example = "IFC_EDIT")
        String jobType,

        @Schema(description = "초기 비동기 작업 상태입니다.", example = "QUEUED")
        String status,

        @Schema(description = "초기 비동기 작업 진행률입니다.", example = "0")
        Integer progress
) {
}
