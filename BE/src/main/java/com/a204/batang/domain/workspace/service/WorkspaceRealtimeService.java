package com.a204.batang.domain.workspace.service;

import com.a204.batang.domain.workspace.dto.BubbleUpdateRequest;
import com.a204.batang.domain.workspace.dto.ProjectSyncResponse;
import com.a204.batang.domain.workspace.entity.PhaseStatus;
import com.a204.batang.domain.workspace.entity.ProjectWorkspace;
import com.a204.batang.domain.workspace.repository.ProjectWorkspaceRepository;
import com.a204.batang.domain.workspace.repository.WorkspaceBubbleSnapshotRedisRepository;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.dao.DataAccessException;
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
    private final WorkspaceBubbleSnapshotRedisRepository workspaceBubbleSnapshotRedisRepository;
    private final SimpMessagingTemplate simpMessagingTemplate;
    private final ObjectMapper objectMapper;

    /**
     * 버블 드래프트 변경 이벤트를 구독 채널로 브로드캐스트한다.
     * 현재 단계에서는 DB에는 저장하지 않고, Redis 최신값 저장 후 실시간 동기화만 수행한다.
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
        saveBubbleSnapshotToRedisOrThrow(projectId, snapshot, request.baseIndex());

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

    /**
     * 웹소켓으로 수신한 버블 스냅샷을 Redis 최신값으로 저장한다.
     * Redis 저장이 실패하면 브로드캐스트를 중단해 데이터 불일치를 막는다.
     *
     * @param projectId 프로젝트 ID
     * @param snapshot 버블 스냅샷 JSON
     * @param baseIndex 이번 변경이 파생된 기준 스냅샷 인덱스
     */
    private void saveBubbleSnapshotToRedisOrThrow(UUID projectId, JsonNode snapshot, int baseIndex) {
        try {
            workspaceBubbleSnapshotRedisRepository.saveSnapshot(projectId, snapshot, baseIndex);
        } catch (IllegalArgumentException exception) {
            throw new CustomException(
                    ErrorCode.WORKSPACE_BUBBLE_HISTORY_CURSOR_INVALID,
                    "Undo/Redo 기준 인덱스가 현재 히스토리와 일치하지 않습니다."
            );
        } catch (JsonProcessingException exception) {
            log.error("Failed to serialize bubble snapshot. projectId={}", projectId, exception);
            throw new CustomException(
                    ErrorCode.WORKSPACE_BUBBLE_CACHE_SAVE_FAILED,
                    "버블 스냅샷 직렬화에 실패했습니다."
            );
        } catch (DataAccessException exception) {
            log.error("Failed to save bubble snapshot to redis. projectId={}", projectId, exception);
            throw new CustomException(
                    ErrorCode.WORKSPACE_BUBBLE_CACHE_SAVE_FAILED,
                    "캐시 서버 통신에 실패했습니다."
            );
        }
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
        if (request == null || request.bubbles() == null || request.connections() == null || request.baseIndex() == null) {
            throw new CustomException(
                    ErrorCode.WORKSPACE_BUBBLE_SNAPSHOT_INVALID,
                    "bubbles, connections and baseIndex are required."
            );
        }

        if (request.baseIndex() < -1) {
            throw new CustomException(
                    ErrorCode.WORKSPACE_BUBBLE_SNAPSHOT_INVALID,
                    "baseIndex must be greater than or equal to -1."
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
