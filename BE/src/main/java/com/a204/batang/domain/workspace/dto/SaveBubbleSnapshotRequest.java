package com.a204.batang.domain.workspace.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

import java.util.List;

/**
 * 버블 다이어그램 저장 요청 DTO.
 *
 * @param bubbles 저장할 버블 목록
 * @param connections 저장할 연결 목록
 * @param zones 저장할 조닝 목록
 */
public record SaveBubbleSnapshotRequest(
        @Valid
        @NotNull(message = "bubbles is required.")
        List<BubbleUpdateRequest.BubbleData> bubbles,
        @Valid
        @NotNull(message = "connections is required.")
        List<BubbleUpdateRequest.ConnectionData> connections,
        @Valid
        List<BubbleZoneData> zones,
        @Valid
        BubbleFloorMeta floorMeta
) implements BubbleSnapshotPayload {
}
