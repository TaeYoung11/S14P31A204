package com.a204.batang.domain.workspace.service;

import com.a204.batang.domain.workspace.dto.BubbleUpdateRequest.BubbleData;
import com.a204.batang.domain.workspace.dto.BubbleUpdateRequest.ConnectionData;
import com.a204.batang.domain.workspace.dto.BubbleSnapshotPayload;
import com.a204.batang.domain.workspace.dto.SaveBubbleSnapshotRequest;
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

    /**
     * workspace snapshot JSON이 mapper 입력으로 사용할 수 있는 구조인지 검증한다.
     *
     * @param snapshotNode workspace snapshot JSON
     * @return 검증 및 변환된 snapshot payload
     */
    public BubbleSnapshotPayload readSnapshotPayloadOrThrow(JsonNode snapshotNode) {
        if (snapshotNode == null || snapshotNode.isNull() || !snapshotNode.isObject()) {
            throw new CustomException(
                    ErrorCode.FLOOR_PLAN_SNAPSHOT_CONVERSION_FAILED,
                    "workspace snapshot은 JSON object여야 합니다."
            );
        }

        JsonNode bubblesNode = snapshotNode.get("bubbles");
        JsonNode connectionsNode = snapshotNode.get("connections");
        if (bubblesNode == null || connectionsNode == null || !bubblesNode.isArray() || !connectionsNode.isArray()) {
            throw new CustomException(
                    ErrorCode.FLOOR_PLAN_SNAPSHOT_CONVERSION_FAILED,
                    "workspace snapshot에는 bubbles, connections 배열이 모두 있어야 합니다."
            );
        }

        try {
            SaveBubbleSnapshotRequest payload = objectMapper.treeToValue(snapshotNode, SaveBubbleSnapshotRequest.class);
            validatePayloadOrThrow(payload);
            return payload;
        } catch (CustomException e) {
            throw e;
        } catch (Exception e) {
            throw new CustomException(
                    ErrorCode.FLOOR_PLAN_SNAPSHOT_CONVERSION_FAILED,
                    "workspace snapshot을 bubble snapshot payload로 변환할 수 없습니다."
            );
        }
    }
}
