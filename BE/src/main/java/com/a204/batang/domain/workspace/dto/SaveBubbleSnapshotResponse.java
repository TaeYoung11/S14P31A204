package com.a204.batang.domain.workspace.dto;

import com.a204.batang.domain.workspace.entity.PhaseStatus;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 버블 다이어그램 저장 응답 DTO.
 *
 * @param projectId 프로젝트 ID
 * @param phaseStatus 저장 시점 워크스페이스 단계
 * @param savedAt 저장 완료 시각
 */
public record SaveBubbleSnapshotResponse(
        UUID projectId,
        PhaseStatus phaseStatus,
        LocalDateTime savedAt
) {
}
