package com.a204.batang.domain.workspace.dto;

import com.a204.batang.domain.workspace.entity.PhaseStatus;
import com.fasterxml.jackson.databind.JsonNode;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 2D/3D 실시간 편집 동기화 응답 DTO.
 *
 * @param action 동기화 액션명
 * @param projectId 프로젝트 ID
 * @param status 현재 워크스페이스 단계
 * @param revisionId 클라이언트가 추적할 리비전 ID
 * @param floorPlanPayloadJson 브로드캐스트할 2D/3D 편집 payload
 * @param s3Url 파이썬 결과물 S3 URL
 * @param updatedAt 동기화 시각
 */
public record FloorPlanProjectSyncResponse(
        String action,
        UUID projectId,
        PhaseStatus status,
        String revisionId,
        JsonNode floorPlanPayloadJson,
        String s3Url,
        LocalDateTime updatedAt
) {
}

