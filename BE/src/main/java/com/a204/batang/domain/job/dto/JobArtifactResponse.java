package com.a204.batang.domain.job.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.UUID;

@Schema(description = "작업 결과 산출물 요약 정보")
public record JobArtifactResponse(
        @Schema(description = "산출물 ID")
        UUID artifactId,
        @Schema(description = "산출물 타입")
        String artifactType,
        @Schema(description = "연결된 revision ID")
        UUID revisionId,
        @Schema(description = "파일명")
        String fileName,
        @Schema(description = "MIME 타입")
        String mimeType,
        @Schema(description = "저장소 URL")
        String storageUrl,
        @Schema(description = "생성 시각 (UTC ISO-8601)")
        String createdAt
) {
}
