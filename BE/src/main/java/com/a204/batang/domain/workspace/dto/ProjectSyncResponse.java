package com.a204.batang.domain.workspace.dto;

import com.a204.batang.domain.workspace.entity.PhaseStatus;
import com.fasterxml.jackson.databind.JsonNode;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 프로젝트 실시간 동기화 응답 DTO.
 *
 * @param action 동기화 액션명
 * @param projectId 프로젝트 ID
 * @param status 현재 편집 단계
 * @param bubbleSnapshotJson 최신 버블 스냅샷
 * @param updatedAt 동기화 시각
 */
public record ProjectSyncResponse(
        String action,
        UUID projectId,
        PhaseStatus status,
        JsonNode bubbleSnapshotJson,
        LocalDateTime updatedAt
) {
}
