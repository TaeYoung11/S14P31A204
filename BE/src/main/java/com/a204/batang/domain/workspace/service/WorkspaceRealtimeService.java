package com.a204.batang.domain.workspace.service;

import com.a204.batang.domain.workspace.dto.BubbleUpdateRequest;
import com.a204.batang.domain.workspace.dto.ProjectSyncResponse;
import com.a204.batang.domain.workspace.entity.PhaseStatus;
import com.a204.batang.domain.workspace.entity.ProjectWorkspace;
import com.a204.batang.domain.workspace.repository.ProjectWorkspaceRepository;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

/**
 * 프로젝트 워크스페이스의 버블 다이어그램 실시간 동기화를 처리한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WorkspaceRealtimeService {

    private static final String PROJECT_SYNC_TOPIC_TEMPLATE = "/topic/project/%s/sync";
    private static final String ACTION_BUBBLE_UPDATED = "BUBBLE_UPDATED";

    private final ProjectWorkspaceRepository projectWorkspaceRepository;
    private final SimpMessagingTemplate simpMessagingTemplate;
    private final ObjectMapper objectMapper;

    /**
     * 버블 드래프트 변경 이벤트를 구독 채널로 브로드캐스트한다.
     * 현재 단계에서는 DB 저장 없이 실시간 동기화만 수행한다.
     *
     * @param projectId 프로젝트 ID
     * @param request 버블 동기화 요청 페이로드
     */
    @Transactional(readOnly = true)
    public void updateBubbleDraft(UUID projectId, BubbleUpdateRequest request) {
        // DB 조회 전, 페이로드 자체의 비즈니스 유효성을 먼저 검증한다.
        // 잘못된 메시지는 DB I/O 없이 즉시 차단해 리소스를 절약한다.
        validateBubblePayloadOrThrow(request);

        ProjectWorkspace workspace = projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId)
                .orElseThrow(() -> new CustomException(ErrorCode.PROJECT_NOT_FOUND));

        validateBubbleDraftPhaseOrThrow(workspace.getPhaseStatus());

        JsonNode snapshot = buildSnapshot(request);
        ProjectSyncResponse response = new ProjectSyncResponse(
                ACTION_BUBBLE_UPDATED,
                projectId,
                workspace.getPhaseStatus(),
                snapshot,
                LocalDateTime.now()
        );
        simpMessagingTemplate.convertAndSend(PROJECT_SYNC_TOPIC_TEMPLATE.formatted(projectId), response);

        log.info("Bubble snapshot relayed via websocket. projectId={}", projectId);
    }

    private void validateBubbleDraftPhaseOrThrow(PhaseStatus phaseStatus) {
        if (phaseStatus == PhaseStatus.BUBBLE_DRAFT) {
            return;
        }

        throw new CustomException(
                ErrorCode.WORKSPACE_INVALID_PHASE,
                "버블 편집은 BUBBLE_DRAFT 단계에서만 가능합니다."
        );
    }

    private void validateBubblePayloadOrThrow(BubbleUpdateRequest request) {
        // STOMP @Valid가 기본 검증을 처리하지만, 서비스 단독 호출/예외 케이스를 대비한 최소 방어 코드다.
        if (request == null || request.bubbles() == null || request.connections() == null) {
            throw new CustomException(
                    ErrorCode.WORKSPACE_BUBBLE_SNAPSHOT_INVALID,
                    "bubbles and connections are required."
            );
        }

        Set<String> bubbleIds = new HashSet<>();
        for (BubbleUpdateRequest.BubbleData bubble : request.bubbles()) {
            if (!bubbleIds.add(bubble.id())) {
                throw new CustomException(
                        ErrorCode.WORKSPACE_BUBBLE_SNAPSHOT_INVALID,
                        "duplicate bubble id is not allowed."
                );
            }
        }

        for (BubbleUpdateRequest.ConnectionData connection : request.connections()) {
            if (!bubbleIds.contains(connection.from()) || !bubbleIds.contains(connection.to())) {
                throw new CustomException(
                        ErrorCode.WORKSPACE_BUBBLE_SNAPSHOT_INVALID,
                        "connection references unknown bubble id."
                );
            }
        }
    }

    private JsonNode buildSnapshot(BubbleUpdateRequest request) {
        ObjectNode root = objectMapper.createObjectNode();
        root.set("bubbles", objectMapper.valueToTree(request.bubbles()));
        root.set("connections", objectMapper.valueToTree(request.connections()));
        return root;
    }
}
