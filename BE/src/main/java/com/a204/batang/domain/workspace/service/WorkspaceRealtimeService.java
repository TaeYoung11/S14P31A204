package com.a204.batang.domain.workspace.service;

import com.a204.batang.domain.project.service.ProjectAccessService;
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
 * 프로젝트 워크스페이스의 버블 다이어그램 실시간 동기화를 처리한다.
 */
@Service
@RequiredArgsConstructor
public class WorkspaceRealtimeService {

    private static final Logger log = LoggerFactory.getLogger(WorkspaceRealtimeService.class);

    private static final String PROJECT_SYNC_TOPIC_TEMPLATE = "/topic/project/%s/sync";
    private static final String ACTION_BUBBLE_UPDATED = "BUBBLE_UPDATED";

    private final ProjectWorkspaceRepository projectWorkspaceRepository;
    private final ProjectAccessService projectAccessService;
    private final WorkspaceBubbleSnapshotRedisRepository workspaceBubbleSnapshotRedisRepository;
    private final BubbleSnapshotHelper bubbleSnapshotHelper;
    private final SimpMessagingTemplate simpMessagingTemplate;

    /**
     * 버블 편집 스냅샷을 Redis에 임시 저장하고 프로젝트 구독 채널로 브로드캐스트한다.
     *
     * @param projectId 프로젝트 ID
     * @param currentUserId 현재 사용자 ID
     * @param request 버블 동기화 요청 payload
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
     * 웹소켓으로 수신한 버블 스냅샷을 Redis 최신값으로 저장한다.
     * 저장 실패 시 브로드캐스트를 중단해 데이터 불일치를 방지한다.
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

    private void validateRealtimePayloadOrThrow(BubbleUpdateRequest request) {
        bubbleSnapshotHelper.validatePayloadOrThrow(request);
    }
}
