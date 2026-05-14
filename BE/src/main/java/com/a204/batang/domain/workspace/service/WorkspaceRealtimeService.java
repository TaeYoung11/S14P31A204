package com.a204.batang.domain.workspace.service;

import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.domain.project.service.ProjectQueryService;
import com.a204.batang.domain.workspace.dto.BubbleRedoRequest;
import com.a204.batang.domain.workspace.dto.BubbleUndoRequest;
import com.a204.batang.domain.workspace.dto.BubbleUpdateRequest;
import com.a204.batang.domain.workspace.dto.ProjectSyncResponse;
import com.a204.batang.domain.workspace.dto.WorkspaceHistorySnapshotResponse;
import com.a204.batang.domain.workspace.entity.ProjectWorkspace;
import com.a204.batang.domain.workspace.repository.ProjectWorkspaceRepository;
import com.a204.batang.domain.workspace.repository.WorkspaceBubbleSnapshotRedisRepository;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.a204.batang.global.storage.S3ObjectPresigner;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
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
 * 프로젝트 워크스페이스의 버블 다이어그램 실시간 편집 이벤트를 처리한다.
 */
@Service
@RequiredArgsConstructor
public class WorkspaceRealtimeService {

    private static final Logger log = LoggerFactory.getLogger(WorkspaceRealtimeService.class);

    private static final String PROJECT_SYNC_TOPIC_TEMPLATE = "/topic/project/%s/sync";
    private static final String ACTION_BUBBLE_UPDATED = "BUBBLE_UPDATED";
    private static final String ACTION_BUBBLE_UNDO = "BUBBLE_UNDO";
    private static final String ACTION_BUBBLE_REDO = "BUBBLE_REDO";
    private static final int WORKSPACE_HISTORY_MAX_INDEX = 9;

    private final ProjectWorkspaceRepository projectWorkspaceRepository;
    private final ProjectAccessService projectAccessService;
    private final ProjectQueryService projectQueryService;
    private final WorkspaceBubbleSnapshotRedisRepository workspaceBubbleSnapshotRedisRepository;
    private final BubbleSnapshotHelper bubbleSnapshotHelper;
    private final S3ObjectPresigner s3ObjectPresigner;
    private final SimpMessagingTemplate simpMessagingTemplate;

    /**
     * 워크스페이스 최초 진입에 필요한 최신 Redis 히스토리 스냅샷을 조회한다.
     *
     * @param projectId 프로젝트 ID
     * @return phase/siteInfo/버블/플로어플랜 최신 스냅샷 응답
     */
    @Transactional(readOnly = true)
    public WorkspaceHistorySnapshotResponse getWorkspaceHistorySnapshot(UUID projectId) {
        var projectDetail = projectQueryService.getMyProjectDetail(projectId);

        WorkspaceHistorySnapshotResponse.WorkspaceHistoryState bubbleHistory =
                resolveLatestBubbleHistoryState(projectId, projectDetail.bubbleSnapshotJson());
        WorkspaceHistorySnapshotResponse.WorkspaceHistoryState floorPlanHistory =
                resolveLatestFloorPlanHistoryState(projectId);

        return new WorkspaceHistorySnapshotResponse(
                projectDetail.phaseStatus(),
                projectDetail.siteInfo(),
                bubbleHistory,
                floorPlanHistory
        );
    }

    /**
     * 버블 다이어그램 스냅샷을 Redis 히스토리에 저장하고 구독자에게 브로드캐스트한다.
     *
     * @param projectId 프로젝트 ID
     * @param currentUserId 요청 사용자 ID
     * @param request 버블 업데이트 요청
     */
    @Transactional(readOnly = true)
    public void updateBubbleDraft(UUID projectId, UUID currentUserId, BubbleUpdateRequest request) {
        validateRealtimePayloadOrThrow(request);

        ProjectWorkspace workspace = resolveWorkspaceOrThrow(projectId);
        projectAccessService.validateProjectOwnerOrThrow(workspace.getProject(), currentUserId);
        bubbleSnapshotHelper.validatePhaseOrThrow(workspace.getPhaseStatus());

        JsonNode snapshot = bubbleSnapshotHelper.buildSnapshot(request);
        saveBubbleSnapshotToRedisOrThrow(projectId, snapshot, request.baseIndex());

        int targetIndex = resolveBubbleUpdateTargetIndex(request.baseIndex());
        broadcastBubbleSync(projectId, workspace, ACTION_BUBBLE_UPDATED, snapshot, targetIndex);
        log.info("Bubble snapshot relayed via websocket. projectId={}", projectId);
    }

    /**
     * 버블 다이어그램 Undo를 수행한다.
     *
     * @param projectId 프로젝트 ID
     * @param currentUserId 요청 사용자 ID
     * @param request Undo 요청
     */
    @Transactional(readOnly = true)
    public void undoBubbleDraft(UUID projectId, UUID currentUserId, BubbleUndoRequest request) {
        ProjectWorkspace workspace = resolveWorkspaceOrThrow(projectId);
        projectAccessService.validateProjectOwnerOrThrow(workspace.getProject(), currentUserId);
        bubbleSnapshotHelper.validatePhaseOrThrow(workspace.getPhaseStatus());

        int targetIndex = request.baseIndex() - 1;
        JsonNode undoSnapshot = loadUndoBubbleSnapshotOrThrow(projectId, request.baseIndex());
        broadcastBubbleSync(projectId, workspace, ACTION_BUBBLE_UNDO, undoSnapshot, targetIndex);

        log.info("Bubble undo relayed via websocket. projectId={}, currentIndex={}", projectId, request.baseIndex());
    }

    /**
     * 버블 다이어그램 Redo를 수행한다.
     *
     * @param projectId 프로젝트 ID
     * @param currentUserId 요청 사용자 ID
     * @param request Redo 요청
     */
    @Transactional(readOnly = true)
    public void redoBubbleDraft(UUID projectId, UUID currentUserId, BubbleRedoRequest request) {
        ProjectWorkspace workspace = resolveWorkspaceOrThrow(projectId);
        projectAccessService.validateProjectOwnerOrThrow(workspace.getProject(), currentUserId);
        bubbleSnapshotHelper.validatePhaseOrThrow(workspace.getPhaseStatus());

        int targetIndex = request.baseIndex() + 1;
        JsonNode redoSnapshot = loadRedoBubbleSnapshotOrThrow(projectId, request.baseIndex());
        broadcastBubbleSync(projectId, workspace, ACTION_BUBBLE_REDO, redoSnapshot, targetIndex);

        log.info("Bubble redo relayed via websocket. projectId={}, currentIndex={}", projectId, request.baseIndex());
    }

    /**
     * Redis 히스토리에서 Undo 대상 스냅샷을 조회한다.
     *
     * <p>Undo 후 새 편집으로 히스토리가 분기된 경우, 클라이언트가 오래된 baseIndex를 보내면
     * {@link ErrorCode#WORKSPACE_BUBBLE_HISTORY_CURSOR_INVALID} 예외를 반환한다.
     *
     * @param projectId 프로젝트 ID
     * @param currentIndex 클라이언트 현재 인덱스
     * @return Undo 대상 스냅샷
     */
    private JsonNode loadUndoBubbleSnapshotOrThrow(UUID projectId, int currentIndex) {
        int historySize = getBubbleSnapshotHistorySizeOrThrow(projectId);
        validateUndoCursorOrThrow(currentIndex, historySize);

        int targetIndex = currentIndex - 1;
        return findBubbleSnapshotByIndexOrThrow(projectId, targetIndex);
    }

    /**
     * Redis 히스토리에서 Redo 대상 스냅샷을 조회한다.
     *
     * @param projectId 프로젝트 ID
     * @param currentIndex 클라이언트 현재 인덱스
     * @return Redo 대상 스냅샷
     */
    private JsonNode loadRedoBubbleSnapshotOrThrow(UUID projectId, int currentIndex) {
        int historySize = getBubbleSnapshotHistorySizeOrThrow(projectId);
        validateRedoCursorOrThrow(currentIndex, historySize);

        int targetIndex = currentIndex + 1;
        return findBubbleSnapshotByIndexOrThrow(projectId, targetIndex);
    }

    private void validateUndoCursorOrThrow(int currentIndex, int historySize) {
        if (historySize <= 0 || currentIndex <= 0 || currentIndex >= historySize) {
            throw new CustomException(
                    ErrorCode.WORKSPACE_BUBBLE_HISTORY_CURSOR_INVALID,
                    "Undo할 수 있는 이전 버블 스냅샷이 없습니다."
            );
        }
    }

    private void validateRedoCursorOrThrow(int currentIndex, int historySize) {
        if (historySize <= 0 || currentIndex < -1 || currentIndex >= historySize) {
            throw new CustomException(
                    ErrorCode.WORKSPACE_BUBBLE_HISTORY_CURSOR_INVALID,
                    "Redo 기준 인덱스가 현재 버블 히스토리와 일치하지 않습니다."
            );
        }

        if (currentIndex + 1 >= historySize) {
            throw new CustomException(
                    ErrorCode.WORKSPACE_BUBBLE_HISTORY_CURSOR_INVALID,
                    "Redo할 수 있는 다음 버블 스냅샷이 없습니다."
            );
        }
    }

    private int getBubbleSnapshotHistorySizeOrThrow(UUID projectId) {
        try {
            return workspaceBubbleSnapshotRedisRepository.getBubbleSnapshotHistorySize(projectId);
        } catch (DataAccessException exception) {
            log.error("Failed to fetch bubble snapshot history size from redis. projectId={}", projectId, exception);
            throw new CustomException(
                    ErrorCode.WORKSPACE_BUBBLE_CACHE_READ_FAILED,
                    "버블 히스토리 조회 중 Redis 오류가 발생했습니다."
            );
        }
    }

    private int getFloorPlanSnapshotHistorySizeOrThrow(UUID projectId) {
        try {
            return workspaceBubbleSnapshotRedisRepository.getFloorPlanSnapshotHistorySize(projectId);
        } catch (DataAccessException exception) {
            log.error("Failed to fetch floor-plan snapshot history size from redis. projectId={}", projectId, exception);
            throw new CustomException(
                    ErrorCode.WORKSPACE_FLOOR_PLAN_CACHE_READ_FAILED,
                    "Floor-plan 히스토리 조회 중 Redis 오류가 발생했습니다."
            );
        }
    }

    private JsonNode findBubbleSnapshotByIndexOrThrow(UUID projectId, int targetIndex) {
        try {
            JsonNode snapshot = workspaceBubbleSnapshotRedisRepository.findBubbleSnapshotByIndex(projectId, targetIndex);
            if (snapshot == null) {
                throw new CustomException(
                        ErrorCode.WORKSPACE_BUBBLE_HISTORY_CURSOR_INVALID,
                        "요청한 Undo/Redo 버블 스냅샷을 찾을 수 없습니다."
                );
            }
            return normalizeBubbleSnapshotOrThrow(snapshot);
        } catch (JsonProcessingException exception) {
            log.error("Failed to deserialize bubble snapshot from redis. projectId={}, index={}", projectId, targetIndex, exception);
            throw new CustomException(
                    ErrorCode.WORKSPACE_BUBBLE_CACHE_READ_FAILED,
                    "버블 히스토리 스냅샷 역직렬화에 실패했습니다."
            );
        } catch (DataAccessException exception) {
            log.error("Failed to read bubble snapshot from redis. projectId={}, index={}", projectId, targetIndex, exception);
            throw new CustomException(
                    ErrorCode.WORKSPACE_BUBBLE_CACHE_READ_FAILED,
                    "버블 히스토리 조회 중 Redis 오류가 발생했습니다."
            );
        }
    }

    private JsonNode findFloorPlanSnapshotByIndexOrThrow(UUID projectId, int targetIndex) {
        try {
            JsonNode snapshot = workspaceBubbleSnapshotRedisRepository.findFloorPlanSnapshotByIndex(projectId, targetIndex);
            if (snapshot == null) {
                throw new CustomException(
                        ErrorCode.WORKSPACE_FLOOR_PLAN_HISTORY_CURSOR_INVALID,
                        "요청한 floor-plan 스냅샷을 찾을 수 없습니다."
                );
            }
            return snapshot;
        } catch (JsonProcessingException exception) {
            log.error("Failed to deserialize floor-plan snapshot from redis. projectId={}, index={}", projectId, targetIndex, exception);
            throw new CustomException(
                    ErrorCode.WORKSPACE_FLOOR_PLAN_CACHE_READ_FAILED,
                    "Floor-plan 히스토리 스냅샷 역직렬화에 실패했습니다."
            );
        } catch (DataAccessException exception) {
            log.error("Failed to read floor-plan snapshot from redis. projectId={}, index={}", projectId, targetIndex, exception);
            throw new CustomException(
                    ErrorCode.WORKSPACE_FLOOR_PLAN_CACHE_READ_FAILED,
                    "Floor-plan 히스토리 조회 중 Redis 오류가 발생했습니다."
            );
        }
    }

    private WorkspaceHistorySnapshotResponse.WorkspaceHistoryState resolveLatestBubbleHistoryState(
            UUID projectId,
            JsonNode fallbackSnapshot
    ) {
        int historySize = getBubbleSnapshotHistorySizeOrThrow(projectId);
        if (historySize <= 0) {
            if (fallbackSnapshot == null || fallbackSnapshot.isNull()) {
                return WorkspaceHistorySnapshotResponse.WorkspaceHistoryState.empty();
            }
            JsonNode normalizedFallbackSnapshot = normalizeBubbleSnapshotOrThrow(fallbackSnapshot);
            return WorkspaceHistorySnapshotResponse.WorkspaceHistoryState.latest(0, normalizedFallbackSnapshot, null);
        }

        int latestIndex = historySize - 1;
        JsonNode latestSnapshot = findBubbleSnapshotByIndexOrThrow(projectId, latestIndex);
        return WorkspaceHistorySnapshotResponse.WorkspaceHistoryState.latest(latestIndex, latestSnapshot, null);
    }

    private WorkspaceHistorySnapshotResponse.WorkspaceHistoryState resolveLatestFloorPlanHistoryState(UUID projectId) {
        int historySize = getFloorPlanSnapshotHistorySizeOrThrow(projectId);
        if (historySize <= 0) {
            return WorkspaceHistorySnapshotResponse.WorkspaceHistoryState.empty();
        }

        int latestIndex = historySize - 1;
        JsonNode latestHistorySnapshot = findFloorPlanSnapshotByIndexOrThrow(projectId, latestIndex);

        if (latestHistorySnapshot == null || latestHistorySnapshot.isNull() || !latestHistorySnapshot.isObject()) {
            throw new CustomException(
                    ErrorCode.WORKSPACE_FLOOR_PLAN_CACHE_READ_FAILED,
                    "Floor-plan 히스토리 스냅샷 형식이 올바르지 않습니다."
            );
        }

        JsonNode payloadNode = latestHistorySnapshot.get("floorPlanPayloadJson");
        if (payloadNode == null || payloadNode.isNull() || !payloadNode.isObject()) {
            throw new CustomException(
                    ErrorCode.WORKSPACE_FLOOR_PLAN_CACHE_READ_FAILED,
                    "Floor-plan 히스토리 스냅샷에 floorPlanPayloadJson이 없습니다."
            );
        }

        JsonNode s3UrlNode = latestHistorySnapshot.get("s3Url");
        String s3Url = null;
        if (s3UrlNode != null && !s3UrlNode.isNull()) {
            s3Url = resolveHistoryFloorPlanS3Url(s3UrlNode.asText());
        }

        return WorkspaceHistorySnapshotResponse.WorkspaceHistoryState.latest(latestIndex, payloadNode, s3Url);
    }

    /**
     * 히스토리 스냅샷의 IFC 경로를 클라이언트가 즉시 fetch 가능한 URL로 변환한다.
     *
     * <p>presign 실패 시 히스토리 조회 자체가 깨지지 않도록 원본 값을 반환한다.
     *
     * @param rawS3Url Redis에 저장된 원본 IFC 경로
     * @return 브라우저 접근 가능한 IFC URL
     */
    private String resolveHistoryFloorPlanS3Url(String rawS3Url) {
        if (rawS3Url == null || rawS3Url.isBlank()) {
            return null;
        }

        try {
            return s3ObjectPresigner.presignIfInternal(rawS3Url, ErrorCode.WORKSPACE_IFC_EXPORT_PRESIGN_FAILED);
        } catch (CustomException exception) {
            log.warn("Failed to presign floor-plan IFC URL for history snapshot. rawS3Url={}", rawS3Url, exception);
            return rawS3Url;
        }
    }

    /**
     * Redis에 버블 스냅샷을 저장한다.
     *
     * @param projectId 프로젝트 ID
     * @param snapshot 버블 스냅샷 JSON
     * @param baseIndex 클라이언트가 기준으로 사용한 현재 히스토리 인덱스
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
            if (containsCause(exception, IllegalArgumentException.class)) {
                throw new CustomException(
                        ErrorCode.WORKSPACE_BUBBLE_HISTORY_CURSOR_INVALID,
                        "Undo/Redo 기준 인덱스가 현재 히스토리와 일치하지 않습니다."
                );
            }

            log.error("Failed to save bubble snapshot to redis. projectId={}", projectId, exception);
            throw new CustomException(
                    ErrorCode.WORKSPACE_BUBBLE_CACHE_SAVE_FAILED,
                    "Redis 저장 중 오류가 발생했습니다."
            );
        }
    }

    private boolean containsCause(Throwable throwable, Class<? extends Throwable> targetType) {
        Throwable cursor = throwable;
        while (cursor != null) {
            if (targetType.isInstance(cursor)) {
                return true;
            }
            cursor = cursor.getCause();
        }
        return false;
    }

    private JsonNode normalizeBubbleSnapshotOrThrow(JsonNode snapshot) {
        try {
            return bubbleSnapshotHelper.normalizeSnapshotOrThrow(snapshot);
        } catch (CustomException exception) {
            throw new CustomException(
                    ErrorCode.WORKSPACE_BUBBLE_CACHE_READ_FAILED,
                    "버블 스냅샷 형식이 올바르지 않습니다."
            );
        }
    }

    private ProjectWorkspace resolveWorkspaceOrThrow(UUID projectId) {
        return projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId)
                .orElseThrow(() -> new CustomException(ErrorCode.PROJECT_NOT_FOUND));
    }

    private void broadcastBubbleSync(
            UUID projectId,
            ProjectWorkspace workspace,
            String action,
            JsonNode bubbleSnapshotJson,
            int targetIndex
    ) {
        JsonNode payloadWithBaseIndex = appendBaseIndexToBubbleSnapshot(bubbleSnapshotJson, targetIndex);
        ProjectSyncResponse response = new ProjectSyncResponse(
                action,
                projectId,
                workspace.getPhaseStatus(),
                payloadWithBaseIndex,
                LocalDateTime.now()
        );

        simpMessagingTemplate.convertAndSend(PROJECT_SYNC_TOPIC_TEMPLATE.formatted(projectId), response);
    }

    private int resolveBubbleUpdateTargetIndex(int baseIndex) {
        return Math.min(WORKSPACE_HISTORY_MAX_INDEX, baseIndex + 1);
    }

    private JsonNode appendBaseIndexToBubbleSnapshot(JsonNode bubbleSnapshotJson, int baseIndex) {
        if (!(bubbleSnapshotJson instanceof ObjectNode bubbleSnapshotObject)) {
            return bubbleSnapshotJson;
        }
        ObjectNode payload = bubbleSnapshotObject.deepCopy();
        payload.put("baseIndex", baseIndex);
        return payload;
    }

    private void validateRealtimePayloadOrThrow(BubbleUpdateRequest request) {
        bubbleSnapshotHelper.validatePayloadOrThrow(request);
    }
}
