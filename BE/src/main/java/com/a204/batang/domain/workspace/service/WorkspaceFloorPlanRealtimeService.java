package com.a204.batang.domain.workspace.service;

import com.a204.batang.domain.ifcedit.IfcEditConstants;
import com.a204.batang.domain.ifcedit.dto.DirectIfcEditRequest;
import com.a204.batang.domain.ifcedit.service.DirectIfcEditCommandService;
import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.domain.workspace.dto.FloorPlanProjectSyncResponse;
import com.a204.batang.domain.workspace.dto.FloorPlanRealtimeUpdateRequest;
import com.a204.batang.domain.workspace.dto.FloorPlanRedoRequest;
import com.a204.batang.domain.workspace.dto.FloorPlanUndoRequest;
import com.a204.batang.domain.workspace.dto.PublishFloorPlanUpdatedRequest;
import com.a204.batang.domain.workspace.entity.ProjectWorkspace;
import com.a204.batang.domain.workspace.repository.ProjectWorkspaceRepository;
import com.a204.batang.domain.workspace.repository.WorkspaceBubbleSnapshotRedisRepository;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * 2D/3D 도면 실시간 편집 이벤트를 처리한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WorkspaceFloorPlanRealtimeService {

    private static final String PROJECT_FLOOR_PLAN_SYNC_TOPIC_TEMPLATE = "/topic/project/%s/floor-plan/sync";
    private static final String ACTION_FLOOR_PLAN_PROCESSING = "FLOOR_PLAN_PROCESSING";
    private static final String ACTION_FLOOR_PLAN_UPDATED = "FLOOR_PLAN_UPDATED";
    private static final String ACTION_FLOOR_PLAN_UNDO = "FLOOR_PLAN_UNDO";
    private static final String ACTION_FLOOR_PLAN_REDO = "FLOOR_PLAN_REDO";
    private static final String DIRECT_IFC_SCHEMA_VERSION = "v1";

    private final ProjectWorkspaceRepository projectWorkspaceRepository;
    private final ProjectAccessService projectAccessService;
    private final BubbleSnapshotHelper bubbleSnapshotHelper;
    private final WorkspaceBubbleSnapshotRedisRepository workspaceBubbleSnapshotRedisRepository;
    private final FloorPlanS3DeleteQueueService floorPlanS3DeleteQueueService;
    private final DirectIfcEditCommandService directIfcEditCommandService;
    private final SimpMessagingTemplate simpMessagingTemplate;
    private final ObjectMapper objectMapper;

    /**
     * 2D/3D 도면 draft를 받아 브로드캐스트하고 Python 렌더링을 비동기 요청한다.
     *
     * @param projectId 프로젝트 ID
     * @param currentUserId 요청 사용자 ID
     * @param request 도면 업데이트 요청
     */
    public void relayFloorPlanDraft(UUID projectId, UUID currentUserId, FloorPlanRealtimeUpdateRequest request) {
        validateRealtimePayloadOrThrow(request);

        ProjectWorkspace workspace = resolveWorkspaceOrThrow(projectId);
        projectAccessService.validateProjectOwnerOrThrow(workspace.getProject(), currentUserId);

        String resolvedRevisionId = resolveRevisionId(request.revisionId(), workspace.getCurrentRevision());
        JsonNode syncPayload = buildSyncPayload(request, resolvedRevisionId);

        requestPythonRenderAsync(projectId, currentUserId, resolvedRevisionId, syncPayload);

        broadcastFloorPlanSync(
                projectId,
                workspace,
                ACTION_FLOOR_PLAN_PROCESSING,
                resolvedRevisionId,
                syncPayload,
                null
        );

        log.info("Floor-plan processing event relayed. projectId={}, revisionId={}", projectId, resolvedRevisionId);
    }

    /**
     * Python 렌더링 완료 이벤트를 받아 floor-plan 히스토리에 저장하고 브로드캐스트한다.
     *
     * @param projectId 프로젝트 ID
     * @param request Python 완료 이벤트 payload
     */
    public void publishFloorPlanUpdated(UUID projectId, PublishFloorPlanUpdatedRequest request) {
        ProjectWorkspace workspace = resolveWorkspaceOrThrow(projectId);

        int baseIndex = extractBaseIndexOrThrow(request.floorPlanPayloadJson());
        String parentRevisionSource = resolveRevisionId(request.revisionId(), workspace.getCurrentRevision());
        UUID parentRevisionId = parseRevisionIdOrNull(parentRevisionSource);
        UUID nextRevisionId = UUID.randomUUID();

        String normalizedS3Url = request.s3Url().trim();

        JsonNode payloadWithRevision = enrichFloorPlanPayloadWithRevision(
                request.floorPlanPayloadJson(),
                nextRevisionId,
                parentRevisionId
        );
        JsonNode floorPlanHistorySnapshot = buildFloorPlanHistorySnapshot(payloadWithRevision, normalizedS3Url);
        saveFloorPlanSnapshotToRedisOrThrow(projectId, floorPlanHistorySnapshot, baseIndex);

        broadcastFloorPlanSync(
                projectId,
                workspace,
                ACTION_FLOOR_PLAN_UPDATED,
                nextRevisionId.toString(),
                payloadWithRevision,
                normalizedS3Url
        );

        log.info(
                "Floor-plan updated event relayed. projectId={}, revisionId={}, parentRevisionId={}",
                projectId,
                nextRevisionId,
                parentRevisionId
        );
    }

    /**
     * IFC apply 완료 직후 floor-plan 동기화 이벤트를 발행한다.
     *
     * <p>ifcedit의 source_scene payload를 기반으로 revision 정보를 갱신해
     * Redis 히스토리와 웹소켓 동기화를 함께 처리한다.
     *
     * @param projectId 프로젝트 ID
     * @param revisionId 최종 반영된 revision ID
     * @param parentRevisionId 부모 revision ID
     * @param s3Url 최종 IFC 결과 S3 URL
     * @param sourceScenePayload ifcedit 요청 시점의 source_scene payload
     */
    public void publishFloorPlanUpdatedFromIfcEdit(
            UUID projectId,
            UUID revisionId,
            UUID parentRevisionId,
            String s3Url,
            JsonNode sourceScenePayload
    ) {
        ProjectWorkspace workspace = resolveWorkspaceOrThrow(projectId);
        JsonNode payloadWithRevision = enrichFloorPlanPayloadWithRevision(
                sanitizeFloorPlanPayload(sourceScenePayload),
                revisionId,
                parentRevisionId
        );

        Integer baseIndex = extractOptionalBaseIndex(payloadWithRevision);
        if (baseIndex != null) {
            JsonNode floorPlanHistorySnapshot = buildFloorPlanHistorySnapshot(payloadWithRevision, s3Url);
            saveFloorPlanSnapshotToRedisOrThrow(projectId, floorPlanHistorySnapshot, baseIndex);
        } else {
            log.warn("Floor-plan updated payload has no valid baseIndex. projectId={}, revisionId={}", projectId, revisionId);
        }

        broadcastFloorPlanSync(
                projectId,
                workspace,
                ACTION_FLOOR_PLAN_UPDATED,
                revisionId.toString(),
                payloadWithRevision,
                s3Url
        );

        log.info("Floor-plan updated event relayed from ifcedit apply completion. projectId={}, revisionId={}",
                projectId, revisionId);
    }

    /**
     * 2D/3D 도면 Undo를 수행한다.
     *
     * @param projectId 프로젝트 ID
     * @param currentUserId 요청 사용자 ID
     * @param request Undo 요청
     */
    @Transactional(readOnly = true)
    public void undoFloorPlanDraft(UUID projectId, UUID currentUserId, FloorPlanUndoRequest request) {
        ProjectWorkspace workspace = resolveWorkspaceOrThrow(projectId);
        projectAccessService.validateProjectOwnerOrThrow(workspace.getProject(), currentUserId);

        JsonNode historySnapshot = loadUndoFloorPlanSnapshotOrThrow(projectId, request.baseIndex());
        FloorPlanHistorySnapshot restoredSnapshot = extractFloorPlanHistorySnapshotOrThrow(historySnapshot);

        broadcastFloorPlanSync(
                projectId,
                workspace,
                ACTION_FLOOR_PLAN_UNDO,
                restoredSnapshot.revisionId(),
                restoredSnapshot.floorPlanPayloadJson(),
                restoredSnapshot.s3Url()
        );

        log.info("Floor-plan undo relayed. projectId={}, currentIndex={}", projectId, request.baseIndex());
    }

    /**
     * 2D/3D 도면 Redo를 수행한다.
     *
     * @param projectId 프로젝트 ID
     * @param currentUserId 요청 사용자 ID
     * @param request Redo 요청
     */
    @Transactional(readOnly = true)
    public void redoFloorPlanDraft(UUID projectId, UUID currentUserId, FloorPlanRedoRequest request) {
        ProjectWorkspace workspace = resolveWorkspaceOrThrow(projectId);
        projectAccessService.validateProjectOwnerOrThrow(workspace.getProject(), currentUserId);

        JsonNode historySnapshot = loadRedoFloorPlanSnapshotOrThrow(projectId, request.baseIndex());
        FloorPlanHistorySnapshot restoredSnapshot = extractFloorPlanHistorySnapshotOrThrow(historySnapshot);

        broadcastFloorPlanSync(
                projectId,
                workspace,
                ACTION_FLOOR_PLAN_REDO,
                restoredSnapshot.revisionId(),
                restoredSnapshot.floorPlanPayloadJson(),
                restoredSnapshot.s3Url()
        );

        log.info("Floor-plan redo relayed. projectId={}, currentIndex={}", projectId, request.baseIndex());
    }

    private JsonNode loadUndoFloorPlanSnapshotOrThrow(UUID projectId, int currentIndex) {
        int historySize = getFloorPlanSnapshotHistorySizeOrThrow(projectId);
        validateFloorPlanUndoCursorOrThrow(currentIndex, historySize);

        int targetIndex = currentIndex - 1;
        return findFloorPlanSnapshotByIndexOrThrow(projectId, targetIndex);
    }

    private JsonNode loadRedoFloorPlanSnapshotOrThrow(UUID projectId, int currentIndex) {
        int historySize = getFloorPlanSnapshotHistorySizeOrThrow(projectId);
        validateFloorPlanRedoCursorOrThrow(currentIndex, historySize);

        int targetIndex = currentIndex + 1;
        return findFloorPlanSnapshotByIndexOrThrow(projectId, targetIndex);
    }

    private void validateFloorPlanUndoCursorOrThrow(int currentIndex, int historySize) {
        if (historySize <= 0 || currentIndex <= 0 || currentIndex >= historySize) {
            throw new CustomException(
                    ErrorCode.WORKSPACE_FLOOR_PLAN_HISTORY_CURSOR_INVALID,
                    "Undo할 수 있는 이전 floor-plan 스냅샷이 없습니다."
            );
        }
    }

    private void validateFloorPlanRedoCursorOrThrow(int currentIndex, int historySize) {
        if (historySize <= 0 || currentIndex < -1 || currentIndex >= historySize) {
            throw new CustomException(
                    ErrorCode.WORKSPACE_FLOOR_PLAN_HISTORY_CURSOR_INVALID,
                    "Redo 기준 인덱스가 현재 floor-plan 히스토리와 일치하지 않습니다."
            );
        }

        if (currentIndex + 1 >= historySize) {
            throw new CustomException(
                    ErrorCode.WORKSPACE_FLOOR_PLAN_HISTORY_CURSOR_INVALID,
                    "Redo할 수 있는 다음 floor-plan 스냅샷이 없습니다."
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

    private JsonNode findFloorPlanSnapshotByIndexOrThrow(UUID projectId, int targetIndex) {
        try {
            JsonNode snapshot = workspaceBubbleSnapshotRedisRepository.findFloorPlanSnapshotByIndex(projectId, targetIndex);
            if (snapshot == null) {
                throw new CustomException(
                        ErrorCode.WORKSPACE_FLOOR_PLAN_HISTORY_CURSOR_INVALID,
                        "요청한 Undo/Redo floor-plan 스냅샷을 찾을 수 없습니다."
                );
            }
            return snapshot;
        } catch (JsonProcessingException exception) {
            log.error(
                    "Failed to deserialize floor-plan snapshot from redis. projectId={}, index={}",
                    projectId,
                    targetIndex,
                    exception
            );
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

    private FloorPlanHistorySnapshot extractFloorPlanHistorySnapshotOrThrow(JsonNode historySnapshot) {
        if (historySnapshot == null || historySnapshot.isNull() || !historySnapshot.isObject()) {
            throw new CustomException(
                    ErrorCode.WORKSPACE_FLOOR_PLAN_HISTORY_CURSOR_INVALID,
                    "Floor-plan 히스토리 스냅샷 형식이 올바르지 않습니다."
            );
        }

        JsonNode floorPlanPayloadJson = historySnapshot.get("floorPlanPayloadJson");
        if (floorPlanPayloadJson == null || floorPlanPayloadJson.isNull() || !floorPlanPayloadJson.isObject()) {
            throw new CustomException(
                    ErrorCode.WORKSPACE_FLOOR_PLAN_HISTORY_CURSOR_INVALID,
                    "Floor-plan 히스토리 스냅샷에 floorPlanPayloadJson이 없습니다."
            );
        }

        JsonNode revisionIdNode = floorPlanPayloadJson.get("revisionId");
        String revisionId = null;
        if (revisionIdNode != null && !revisionIdNode.isNull()) {
            revisionId = revisionIdNode.asText();
        }

        JsonNode s3UrlNode = historySnapshot.get("s3Url");
        String s3Url = null;
        if (s3UrlNode != null && !s3UrlNode.isNull()) {
            s3Url = s3UrlNode.asText();
        }

        return new FloorPlanHistorySnapshot(revisionId, floorPlanPayloadJson, s3Url);
    }

    private void requestPythonRenderAsync(
            UUID projectId,
            UUID currentUserId,
            String revisionId,
            JsonNode syncPayload
    ) {
        UUID baseRevisionId = parseRevisionIdOrThrow(revisionId);
        DirectIfcEditRequest directRequest = new DirectIfcEditRequest(
                DIRECT_IFC_SCHEMA_VERSION,
                UUID.randomUUID(),
                baseRevisionId,
                null,
                IfcEditConstants.SCENE_TYPE_IFC_MODEL,
                syncPayload.deepCopy()
        );
        directIfcEditCommandService.createDirectIfcEdit(projectId, currentUserId, directRequest);
        log.info("Workspace floor-plan realtime request routed to DirectIfcEditCommandService. projectId={}, baseRevisionId={}",
                projectId, baseRevisionId);
    }

    private UUID parseRevisionIdOrThrow(String revisionId) {
        if (revisionId == null || revisionId.isBlank()) {
            throw new CustomException(
                    ErrorCode.IFC_EDIT_SOURCE_NOT_FOUND,
                    "ifcedit 연동에는 UUID 형식의 base revisionId가 필요합니다."
            );
        }

        try {
            return UUID.fromString(revisionId.trim());
        } catch (IllegalArgumentException exception) {
            throw new CustomException(
                    ErrorCode.IFC_EDIT_SOURCE_NOT_FOUND,
                    "ifcedit 연동에는 UUID 형식의 base revisionId가 필요합니다."
            );
        }
    }

    private void validateRealtimePayloadOrThrow(FloorPlanRealtimeUpdateRequest request) {
        bubbleSnapshotHelper.validatePayloadOrThrow(request);
    }

    private String resolveRevisionId(String requestRevisionId, String workspaceRevisionId) {
        if (requestRevisionId != null && !requestRevisionId.isBlank()) {
            return requestRevisionId.trim();
        }
        return workspaceRevisionId;
    }

    private JsonNode buildSyncPayload(FloorPlanRealtimeUpdateRequest request, String resolvedRevisionId) {
        ObjectNode root = objectMapper.createObjectNode();
        root.put("baseIndex", request.baseIndex());
        if (resolvedRevisionId != null) {
            root.put("revisionId", resolvedRevisionId);
        } else {
            root.putNull("revisionId");
        }
        root.put("sceneType", request.sceneType().name());
        root.set("bubbles", objectMapper.valueToTree(request.bubbles()));
        root.set("connections", objectMapper.valueToTree(request.connections()));
        if (request.layout() != null) {
            root.set("layout", request.layout());
        } else {
            root.putNull("layout");
        }
        return root;
    }

    private int extractBaseIndexOrThrow(JsonNode floorPlanPayloadJson) {
        if (floorPlanPayloadJson == null || floorPlanPayloadJson.isNull()) {
            throw new CustomException(ErrorCode.FLOOR_PLAN_OUTPUT_VALIDATION_FAILED, "floorPlanPayloadJson is required.");
        }
        JsonNode baseIndexNode = floorPlanPayloadJson.get("baseIndex");
        if (baseIndexNode == null || !baseIndexNode.canConvertToInt()) {
            throw new CustomException(
                    ErrorCode.FLOOR_PLAN_OUTPUT_VALIDATION_FAILED,
                    "floorPlanPayloadJson.baseIndex must be an integer."
            );
        }
        int baseIndex = baseIndexNode.asInt();
        if (baseIndex < -1) {
            throw new CustomException(
                    ErrorCode.FLOOR_PLAN_OUTPUT_VALIDATION_FAILED,
                    "floorPlanPayloadJson.baseIndex must be greater than or equal to -1."
            );
        }
        return baseIndex;
    }

    private UUID parseRevisionIdOrNull(String revisionId) {
        if (revisionId == null || revisionId.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(revisionId.trim());
        } catch (IllegalArgumentException exception) {
            log.warn("Current revision is not UUID format. revisionId={}", revisionId);
            return null;
        }
    }

    private JsonNode enrichFloorPlanPayloadWithRevision(
            JsonNode floorPlanPayloadJson,
            UUID revisionId,
            UUID parentRevisionId
    ) {
        if (floorPlanPayloadJson == null || floorPlanPayloadJson.isNull() || !floorPlanPayloadJson.isObject()) {
            throw new CustomException(
                    ErrorCode.FLOOR_PLAN_OUTPUT_VALIDATION_FAILED,
                    "floorPlanPayloadJson must be a JSON object."
            );
        }

        ObjectNode payload = floorPlanPayloadJson.deepCopy();
        payload.put("revisionId", revisionId.toString());
        if (parentRevisionId != null) {
            payload.put("parentRevisionId", parentRevisionId.toString());
        } else {
            payload.putNull("parentRevisionId");
        }
        return payload;
    }

    private JsonNode sanitizeFloorPlanPayload(JsonNode payload) {
        if (payload != null && payload.isObject()) {
            return payload;
        }

        ObjectNode fallbackPayload = objectMapper.createObjectNode();
        fallbackPayload.put("baseIndex", -1);
        ArrayNode emptyBubbles = objectMapper.createArrayNode();
        ArrayNode emptyConnections = objectMapper.createArrayNode();
        fallbackPayload.set("bubbles", emptyBubbles);
        fallbackPayload.set("connections", emptyConnections);
        fallbackPayload.putNull("layout");
        return fallbackPayload;
    }

    private Integer extractOptionalBaseIndex(JsonNode floorPlanPayloadJson) {
        if (floorPlanPayloadJson == null || floorPlanPayloadJson.isNull()) {
            return null;
        }

        JsonNode baseIndexNode = floorPlanPayloadJson.get("baseIndex");
        if (baseIndexNode == null || !baseIndexNode.canConvertToInt()) {
            return null;
        }

        int baseIndex = baseIndexNode.asInt();
        if (baseIndex < -1) {
            return null;
        }
        return baseIndex;
    }

    private JsonNode buildFloorPlanHistorySnapshot(JsonNode floorPlanPayloadJson, String s3Url) {
        ObjectNode snapshot = objectMapper.createObjectNode();
        snapshot.set("floorPlanPayloadJson", floorPlanPayloadJson);
        snapshot.put("s3Url", s3Url);
        return snapshot;
    }

    private void saveFloorPlanSnapshotToRedisOrThrow(UUID projectId, JsonNode snapshot, int baseIndex) {
        List<String> garbagePayloads;
        try {
            garbagePayloads = workspaceBubbleSnapshotRedisRepository
                    .saveFloorPlanSnapshotAndReturnGarbage(projectId, snapshot, baseIndex);
        } catch (IllegalArgumentException exception) {
            throw new CustomException(
                    ErrorCode.WORKSPACE_FLOOR_PLAN_HISTORY_CURSOR_INVALID,
                    "Floor-plan Undo/Redo 기준 인덱스가 현재 히스토리와 일치하지 않습니다."
            );
        } catch (JsonProcessingException exception) {
            log.error("Failed to serialize floor-plan snapshot. projectId={}", projectId, exception);
            throw new CustomException(
                    ErrorCode.WORKSPACE_FLOOR_PLAN_CACHE_SAVE_FAILED,
                    "Floor-plan 스냅샷 직렬화에 실패했습니다."
            );
        } catch (DataAccessException exception) {
            if (containsCause(exception, IllegalArgumentException.class)) {
                throw new CustomException(
                        ErrorCode.WORKSPACE_FLOOR_PLAN_HISTORY_CURSOR_INVALID,
                        "Floor-plan Undo/Redo 기준 인덱스가 현재 히스토리와 일치하지 않습니다."
                );
            }

            log.error("Failed to save floor-plan snapshot to redis. projectId={}", projectId, exception);
            throw new CustomException(
                    ErrorCode.WORKSPACE_FLOOR_PLAN_CACHE_SAVE_FAILED,
                    "Redis 저장 중 오류가 발생했습니다."
            );
        }

        enqueueGarbageS3Urls(projectId, garbagePayloads);
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

    private ProjectWorkspace resolveWorkspaceOrThrow(UUID projectId) {
        return projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId)
                .orElseThrow(() -> new CustomException(ErrorCode.PROJECT_NOT_FOUND));
    }

    private void broadcastFloorPlanSync(
            UUID projectId,
            ProjectWorkspace workspace,
            String action,
            String revisionId,
            JsonNode floorPlanPayloadJson,
            String s3Url
    ) {
        FloorPlanProjectSyncResponse response = new FloorPlanProjectSyncResponse(
                action,
                projectId,
                workspace.getPhaseStatus(),
                revisionId,
                floorPlanPayloadJson,
                s3Url,
                LocalDateTime.now()
        );

        simpMessagingTemplate.convertAndSend(
                PROJECT_FLOOR_PLAN_SYNC_TOPIC_TEMPLATE.formatted(projectId),
                response
        );
    }

    /**
     * Lua 스크립트가 반환한 제거 대상 payload에서 S3 URL을 추출해 삭제 대기열에 적재한다.
     *
     * @param projectId 프로젝트 ID
     * @param garbagePayloads 히스토리에서 제거된 스냅샷 payload 목록
     */
    private void enqueueGarbageS3Urls(UUID projectId, List<String> garbagePayloads) {
        if (garbagePayloads == null || garbagePayloads.isEmpty()) {
            return;
        }

        Set<String> garbageS3Urls = extractGarbageS3Urls(garbagePayloads);
        if (garbageS3Urls.isEmpty()) {
            return;
        }

        floorPlanS3DeleteQueueService.enqueueAll(garbageS3Urls);
        log.info("Queued stale floor-plan S3 urls for deferred deletion. projectId={}, queuedCount={}",
                projectId, garbageS3Urls.size());
    }

    /**
     * 제거 대상 스냅샷 payload에서 유효한 s3Url만 추출한다.
     */
    private Set<String> extractGarbageS3Urls(List<String> garbagePayloads) {
        Set<String> garbageS3Urls = new LinkedHashSet<>();
        for (String payload : garbagePayloads) {
            if (payload == null || payload.isBlank()) {
                continue;
            }

            try {
                JsonNode historySnapshot = objectMapper.readTree(payload);
                JsonNode s3UrlNode = historySnapshot.get("s3Url");
                if (s3UrlNode == null || s3UrlNode.isNull()) {
                    continue;
                }

                String normalizedS3Url = normalizeS3Url(s3UrlNode.asText(null));
                if (normalizedS3Url != null) {
                    garbageS3Urls.add(normalizedS3Url);
                }
            } catch (JsonProcessingException exception) {
                log.warn("Failed to parse floor-plan garbage payload for deferred deletion. payload={}", payload, exception);
            }
        }
        return garbageS3Urls;
    }

    private String normalizeS3Url(String rawS3Url) {
        if (rawS3Url == null) {
            return null;
        }

        String normalized = rawS3Url.trim();
        if (normalized.isEmpty()) {
            return null;
        }
        return normalized;
    }

    private record FloorPlanHistorySnapshot(String revisionId, JsonNode floorPlanPayloadJson, String s3Url) {
    }
}
