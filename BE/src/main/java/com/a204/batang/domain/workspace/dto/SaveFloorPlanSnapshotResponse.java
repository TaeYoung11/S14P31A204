package com.a204.batang.domain.workspace.dto;

import com.a204.batang.domain.workspace.entity.PhaseStatus;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 2D/3D 결과물 저장 응답 DTO.
 *
 * @param projectId 프로젝트 ID
 * @param phaseStatus 저장 시점의 워크스페이스 상태
 * @param revisionId 새로 생성된 revision ID
 * @param s3Url 저장된 IFC 결과물 S3 URL
 * @param savedAt 저장 완료 시각
 */
public record SaveFloorPlanSnapshotResponse(
        UUID projectId,
        PhaseStatus phaseStatus,
        String revisionId,
        String s3Url,
        LocalDateTime savedAt
) {
}

