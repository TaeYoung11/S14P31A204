package com.a204.batang.domain.workspace.service;

import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.domain.workspace.dto.BubbleUndoRequest;
import com.a204.batang.domain.workspace.dto.BubbleUpdateRequest;
import com.a204.batang.domain.workspace.dto.ProjectSyncResponse;
import com.a204.batang.domain.workspace.entity.ProjectWorkspace;
import com.a204.batang.domain.workspace.repository.ProjectWorkspaceRepository;
import com.a204.batang.domain.workspace.repository.WorkspaceBubbleSnapshotRedisRepository;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 프로젝트 워크스페이스의 버블 다이어그램 실시간 편집을 처리한다.
 */
@Service
@RequiredArgsConstructor
public class WorkspaceRealtimeService {

    private static final Logger log = LoggerFactory.getLogger(WorkspaceRealtimeService.class);

    private static final String PROJECT_SYNC_TOPIC_TEMPLATE = "/topic/project/%s/sync";
    private static final String ACTION_BUBBLE_UPDATED = "BUBBLE_UPDATED";
    private static final String ACTION_BUBBLE_UNDO = "BUBBLE_UNDO";

    private final ProjectWorkspaceRepository projectWorkspaceRepository;
    private final ProjectAccessService projectAccessService;
    private final WorkspaceBubbleSnapshotRedisRepository workspaceBubbleSnapshotRedisRepository;
    private final BubbleSnapshotHelper bubbleSnapshotHelper;
    private final SimpMessagingTemplate simpMessagingTemplate;

    /**
     * 버블 편집 draft를 Redis에 히스토리로 저장하고 구독 채널로 전파한다.
     *
     * @param projectId 프로젝트 ID
     * @param currentUserId 현재 사용자 ID
     * @param request 버블 편집 요청 payload
     */
    @Transactional(readOnly = true)
    public void updateBubbleDraft(UUID projectId, UUID currentUserId, BubbleUpdateRequest request) {
        validateRealtimePayloadOrThrow(request);

        ProjectWorkspace workspace = projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId)
                .orElseThrow(() -> new CustomException(ErrorCode.PROJECT_NOT_FOUND));

        projectAccessService.validateProjectPinWriterOrThrow(workspace.getProject(), currentUserId);
        bubbleSnapshotHelper.validatePhaseOrThrow(workspace.getPhaseStatus());

        JsonNode snapshot = bubbleSnapshotHelper.buildSnapshot(request);
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
     * 버블 히스토리에서 이전 스냅샷을 조회해 undo 이벤트를 전파한다.
     *
     * @param projectId 프로젝트 ID
     * @param currentUserId 현재 사용자 ID
     * @param request undo 요청 payload
     */
    @Transactional(readOnly = true)
    public void undoBubbleDraft(UUID projectId, UUID currentUserId, BubbleUndoRequest request) {
        ProjectWorkspace workspace = projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId)
                .orElseThrow(() -> new CustomException(ErrorCode.PROJECT_NOT_FOUND));

        projectAccessService.validateProjectPinWriterOrThrow(workspace.getProject(), currentUserId);
        bubbleSnapshotHelper.validatePhaseOrThrow(workspace.getPhaseStatus());

        JsonNode undoSnapshot = loadUndoBubbleSnapshotOrThrow(projectId, request.baseIndex());

        ProjectSyncResponse response = new ProjectSyncResponse(
                ACTION_BUBBLE_UNDO,
                projectId,
                workspace.getPhaseStatus(),
                undoSnapshot,
                LocalDateTime.now()
        );
        simpMessagingTemplate.convertAndSend(PROJECT_SYNC_TOPIC_TEMPLATE.formatted(projectId), response);

        log.info("Bubble undo snapshot relayed via websocket. projectId={}, baseIndex={}", projectId, request.baseIndex());
    }

    /**
     * 웹소켓으로 수신한 버블 스냅샷을 Redis 최신값으로 저장한다.
     *
     * @param projectId 프로젝트 ID
     * @param snapshot 버블 스냅샷 JSON
     * @param baseIndex 이번 변경의 기준 히스토리 인덱스
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

    /**
     * undo 기준 인덱스를 검증하고, 이전 스냅샷을 조회한다.
     *
     * @param projectId 프로젝트 ID
     * @param currentIndex 클라이언트가 보유한 현재 인덱스
     * @return undo 대상 스냅샷
     */
    private JsonNode loadUndoBubbleSnapshotOrThrow(UUID projectId, int currentIndex) {
        try {
            int historySize = workspaceBubbleSnapshotRedisRepository.getBubbleSnapshotHistorySize(projectId);
            if (historySize == 0) {
                throw new CustomException(
                        ErrorCode.WORKSPACE_BUBBLE_HISTORY_CURSOR_INVALID,
                        "Undo할 버블 히스토리가 없습니다."
                );
            }
            if (currentIndex != historySize - 1) {
                throw new CustomException(
                        ErrorCode.WORKSPACE_BUBBLE_HISTORY_CURSOR_INVALID,
                        "Undo 기준 인덱스가 서버 히스토리와 일치하지 않습니다."
                );
            }
            if (currentIndex == 0) {
                throw new CustomException(
                        ErrorCode.WORKSPACE_BUBBLE_HISTORY_CURSOR_INVALID,
                        "더 이상 Undo할 이전 스냅샷이 없습니다."
                );
            }

            return workspaceBubbleSnapshotRedisRepository.findBubbleSnapshotByIndex(projectId, currentIndex - 1)
                    .orElseThrow(() -> new CustomException(
                            ErrorCode.WORKSPACE_BUBBLE_HISTORY_CURSOR_INVALID,
                            "Undo 대상 버블 스냅샷을 찾을 수 없습니다."
                    ));
        } catch (JsonProcessingException exception) {
            log.error("Failed to deserialize bubble snapshot from redis. projectId={}", projectId, exception);
            throw new CustomException(
                    ErrorCode.WORKSPACE_BUBBLE_CACHE_SAVE_FAILED,
                    "버블 스냅샷 역직렬화에 실패했습니다."
            );
        } catch (DataAccessException exception) {
            log.error("Failed to load bubble snapshot from redis. projectId={}", projectId, exception);
            throw new CustomException(
                    ErrorCode.WORKSPACE_BUBBLE_CACHE_SAVE_FAILED,
                    "캐시 서버 통신에 실패했습니다."
            );
        }
    }

    private void validateRealtimePayloadOrThrow(BubbleUpdateRequest request) {
        bubbleSnapshotHelper.validatePayloadOrThrow(request);
    }
}
