package com.a204.batang.domain.workspace.dto;

import com.a204.batang.domain.workspace.dto.BubbleUpdateRequest.BubbleData;
import com.a204.batang.domain.workspace.dto.BubbleUpdateRequest.ConnectionData;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * 2D/3D 실시간 편집 동기화 요청 DTO.
 *
 * @param bubbles 버블 목록
 * @param connections 연결선 목록
 * @param baseIndex 이번 변경이 파생된 기준 스냅샷 인덱스
 * @param revisionId 프런트가 추적 중인 리비전 ID
 * @param sceneType 2D/3D 워커 라우팅 타입
 * @param layout 2D/3D 편집 확장 데이터(JSON)
 */
public record FloorPlanRealtimeUpdateRequest(
        @NotNull(message = "bubbles is required.")
        List<@Valid BubbleData> bubbles,
        @NotNull(message = "connections is required.")
        List<@Valid ConnectionData> connections,
        @NotNull(message = "baseIndex is required.")
        @Min(value = -1, message = "baseIndex must be greater than or equal to -1.")
        Integer baseIndex,
        @Size(max = 50, message = "revisionId must be 50 characters or less.")
        String revisionId,
        @NotNull(message = "sceneType is required.")
        FloorPlanSceneType sceneType,
        @Valid
        @NotNull(message = "workspaceCommand is required.")
        WorkspaceCommand workspaceCommand,
        JsonNode layout
) implements BubbleSnapshotPayload {
}
