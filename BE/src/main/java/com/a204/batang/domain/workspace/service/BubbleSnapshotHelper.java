package com.a204.batang.domain.workspace.service;

import com.a204.batang.domain.workspace.dto.BubbleUpdateRequest.BubbleData;
import com.a204.batang.domain.workspace.dto.BubbleUpdateRequest.ConnectionData;
import com.a204.batang.domain.workspace.dto.BubbleSnapshotPayload;
import com.a204.batang.domain.workspace.entity.PhaseStatus;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.HashSet;
import java.util.Set;

/**
 * 버블 스냅샷의 공통 검증 및 JSON 변환을 담당한다.
 */
@Component
@RequiredArgsConstructor
public class BubbleSnapshotHelper {

    private final ObjectMapper objectMapper;

    /**
     * 버블 다이어그램 작업 가능 단계를 검증한다.
     *
     * @param phaseStatus 현재 워크스페이스 단계
     */
    public void validatePhaseOrThrow(PhaseStatus phaseStatus) {
        if (phaseStatus == PhaseStatus.BUBBLE_DRAFT) {
            return;
        }

        throw new CustomException(
                ErrorCode.WORKSPACE_INVALID_PHASE,
                "버블 작업은 BUBBLE_DRAFT 단계에서만 가능합니다."
        );
    }

    /**
     * 버블/연결 payload의 무결성을 검증한다.
     *
     * @param payload 버블 스냅샷 payload
     */
    public void validatePayloadOrThrow(BubbleSnapshotPayload payload) {
        if (payload == null) {
            throw new CustomException(
                    ErrorCode.WORKSPACE_BUBBLE_SNAPSHOT_INVALID,
                    "bubbles and connections are required."
            );
        }

        var bubbles = payload.bubbles();
        var connections = payload.connections();
        if (bubbles == null || connections == null) {
            throw new CustomException(
                    ErrorCode.WORKSPACE_BUBBLE_SNAPSHOT_INVALID,
                    "bubbles and connections are required."
            );
        }

        Set<String> bubbleIds = new HashSet<>();
        for (BubbleData bubble : bubbles) {
            if (!bubbleIds.add(bubble.id())) {
                throw new CustomException(
                        ErrorCode.WORKSPACE_BUBBLE_SNAPSHOT_INVALID,
                        "duplicate bubble id is not allowed."
                );
            }
        }

        for (ConnectionData connection : connections) {
            if (!bubbleIds.contains(connection.from()) || !bubbleIds.contains(connection.to())) {
                throw new CustomException(
                        ErrorCode.WORKSPACE_BUBBLE_SNAPSHOT_INVALID,
                        "connection references unknown bubble id."
                );
            }
        }
    }

    /**
     * 버블/연결 payload를 스냅샷 JSON 구조로 변환한다.
     *
     * @param payload 버블 스냅샷 payload
     * @return 스냅샷 JSON
     */
    public JsonNode buildSnapshot(BubbleSnapshotPayload payload) {
        ObjectNode root = objectMapper.createObjectNode();
        root.set("bubbles", objectMapper.valueToTree(payload.bubbles()));
        root.set("connections", objectMapper.valueToTree(payload.connections()));
        return root;
    }
}
