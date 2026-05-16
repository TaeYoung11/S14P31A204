package com.a204.batang.domain.workspace.service;

import com.a204.batang.domain.ifcedit.IfcEditConstants;
import com.a204.batang.domain.ifcedit.dto.DirectIfcEditRequest;
import com.a204.batang.domain.ifcedit.service.DirectIfcEditCommandService;
import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.domain.workspace.dto.FloorPlanProjectSyncResponse;
import com.a204.batang.domain.workspace.dto.FloorPlanRealtimeUpdateRequest;
import com.a204.batang.domain.workspace.dto.FloorPlanRedoRequest;
import com.a204.batang.domain.workspace.dto.FloorPlanSceneType;
import com.a204.batang.domain.workspace.dto.FloorPlanUndoRequest;
import com.a204.batang.domain.workspace.dto.PublishFloorPlanUpdatedRequest;
import com.a204.batang.domain.workspace.dto.WorkspaceCommand;
import com.a204.batang.domain.workspace.dto.WorkspaceCommandEnvelope;
import com.a204.batang.domain.workspace.dto.WorkspaceCommandMeta;
import com.a204.batang.domain.workspace.entity.ProjectWorkspace;
import com.a204.batang.domain.workspace.repository.ProjectWorkspaceRepository;
import com.a204.batang.domain.workspace.repository.WorkspaceBubbleSnapshotRedisRepository;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.a204.batang.global.exception.ErrorResponse;
import com.a204.batang.global.storage.S3ObjectPresigner;
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
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * 2D/3D floor-plan 화면 상태의 실시간 동기화, 히스토리, 복구 이벤트를 처리한다.
 *
 * <p>화면 snapshot 저장과 IFC 직접 편집 command 발행은 분리한다.
 * 이 서비스는 snapshot sync와 history 복구를 담당한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WorkspaceFloorPlanRealtimeService {

    private static final String PROJECT_FLOOR_PLAN_SYNC_TOPIC_TEMPLATE = "/topic/project/%s/floor-plan/sync";
    private static final String ACTION_FLOOR_PLAN_PROCESSING = "FLOOR_PLAN_PROCESSING";
    private static final String ACTION_FLOOR_PLAN_UPDATED = "FLOOR_PLAN_UPDATED";
    private static final String ACTION_FLOOR_PLAN_GENERATE_COMPLETED = "FLOOR_PLAN_GENERATE_COMPLETED";
    private static final String ACTION_FLOOR_PLAN_UNDO = "FLOOR_PLAN_UNDO";
    private static final String ACTION_FLOOR_PLAN_REDO = "FLOOR_PLAN_REDO";
    private static final String DIRECT_IFC_SCHEMA_VERSION = "v1";
    private static final int UNKNOWN_FLOOR_PLAN_BASE_INDEX = -1;

    private final ProjectWorkspaceRepository projectWorkspaceRepository;
    private final ProjectAccessService projectAccessService;
    private final BubbleSnapshotHelper bubbleSnapshotHelper;
    private final WorkspaceBubbleSnapshotRedisRepository workspaceBubbleSnapshotRedisRepository;
    private final FloorPlanS3DeleteQueueService floorPlanS3DeleteQueueService;
    private final DirectIfcEditCommandService directIfcEditCommandService;
    private final FloorPlanIfcEditEngineRequestMapper engineRequestMapper;
    private final S3ObjectPresigner s3ObjectPresigner;
    private final SimpMessagingTemplate simpMessagingTemplate;
    private final ObjectMapper objectMapper;

    /**
     * 2D/3D 도면 draft를 받아 Redis history에 저장하고 브로드캐스트한다.
     *
     * <p>이 경로는 화면 상태 동기화 전용이다.
     * IFC_EDIT job 생성은 command pipeline에서만 처리한다.
     *
     * @param projectId 프로젝트 ID
     * @param currentUserId 요청 사용자 ID
     * @param request 도면 업데이트 요청
     */
    @Transactional
    public void relayFloorPlanDraft(UUID projectId, UUID currentUserId, FloorPlanRealtimeUpdateRequest request) {
        validateRealtimePayloadOrThrow(request);
        validateEnvelope(projectId, currentUserId, request.workspaceCommand());

        ProjectWorkspace workspace = resolveWorkspaceOrThrow(projectId);
        projectAccessService.validateProjectOwnerOrThrow(workspace.getProject(), currentUserId);

        String resolvedRevisionId = resolveRevisionId(request.revisionId(), workspace.getCurrentRevision());
        JsonNode syncPayload = buildSyncPayload(request, resolvedRevisionId);
        FloorPlanIfcEditQueueResult queueResult = requestPythonRenderAsync(
                projectId,
                currentUserId,
                resolvedRevisionId,
                request.baseIndex(),
                request.sceneType(),
                request.workspaceCommand(),
                syncPayload
        );
        if (queueResult == FloorPlanIfcEditQueueResult.CONFLICT) {
            log.debug(
                    "Skip floor-plan realtime enqueue because IFC edit job is already active. projectId={}, revisionId={}",
                    projectId,
                    resolvedRevisionId
            );
            return;
        }

        broadcastFloorPlanSync(
                projectId,
                workspace,
                queueResult == FloorPlanIfcEditQueueResult.QUEUED ? ACTION_FLOOR_PLAN_PROCESSING : ACTION_FLOOR_PLAN_UPDATED,
                resolvedRevisionId,
                syncPayload,
                null
        );

        log.info("Floor-plan realtime event relayed. projectId={}, revisionId={}, queueResult={}",
                projectId, resolvedRevisionId, queueResult);
    }

    /**
     * floor-plan 렌더링 완료 이벤트를 받아 Redis history에 저장하고 브로드캐스트한다.
     *
     * @param projectId 프로젝트 ID
     * @param request floor-plan 렌더링 완료 payload
     */
    public void publishFloorPlanUpdated(UUID projectId, PublishFloorPlanUpdatedRequest request) {
        ProjectWorkspace workspace = resolveWorkspaceOrThrow(projectId);

        int baseIndex = extractBaseIndexOrThrow(request.floorPlanPayloadJson());
        String parentRevisionSource = resolveRevisionId(request.revisionId(), workspace.getCurrentRevision());
        UUID parentRevisionId = parseRevisionIdOrNull(parentRevisionSource);
        UUID nextRevisionId = UUID.randomUUID();
        String normalizedS3Url = normalizeS3Url(request.s3Url());

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
     * IFC_EDIT apply 완료 후 sourceScenePayload를 기준으로 floor-plan 동기화 이벤트를 발행한다.
     *
     * <p>sourceScenePayload는 IFC_EDIT 요청 시점의 화면 snapshot이다.
     * 완료된 IFC revision 정보를 payload에 반영해 클라이언트가 최신 결과를 로드하게 한다.
     *
     * @param projectId 프로젝트 ID
     * @param revisionId 최종 반영된 revision ID
     * @param parentRevisionId 부모 revision ID
     * @param s3Url 최종 IFC 결과 S3 URL
     * @param sourceScenePayload IFC_EDIT 요청 시점의 floor-plan snapshot payload
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
     * floor-plan generate 완료 후 클라이언트가 새 IFC revision을 로드하도록 최소 sync payload를 발행한다.
     *
     * <p>generate 완료 이벤트에는 상세 편집 payload가 없을 수 있으므로,
     * 클라이언트가 동일한 sync 응답 포맷을 해석할 수 있도록 최소 payload를 구성해 전송한다.
     *
     * @param projectId 프로젝트 ID
     * @param revisionId 완료된 revision ID
     * @param parentRevisionId 부모 revision ID
     * @param s3Url 생성 결과 IFC S3 URL
     */
    public void publishFloorPlanUpdatedFromGenerate(
            UUID projectId,
            UUID revisionId,
            UUID parentRevisionId,
            String s3Url
    ) {
        ProjectWorkspace workspace = resolveWorkspaceOrThrow(projectId);
        JsonNode payload = buildGenerateCompletionPayload(revisionId, parentRevisionId);

        broadcastFloorPlanSync(
                projectId,
                workspace,
                ACTION_FLOOR_PLAN_GENERATE_COMPLETED,
                revisionId.toString(),
                payload,
                normalizeS3Url(s3Url)
        );

        log.info("Floor-plan updated event relayed from generate completion. projectId={}, revisionId={}",
                projectId, revisionId);
    }

    /**
     * IFC_EDIT command가 DLQ로 이동한 경우 사용자에게 실패를 알리고 source revision 상태를 다시 브로드캐스트한다.
     *
     * <p>이미 workspace가 더 최신 revision으로 이동했다면 오래된 rollback 이벤트로 판단하고
     * floor-plan broadcast를 생략한다.
     *
     * @param projectId 프로젝트 ID
     * @param sourceRevisionId 편집 전 revision ID
     * @param requestedBy 실패 알림을 전달할 사용자 ID
     * @param failureMessage 사용자에게 전달할 실패 메시지
     */
    public void relayIfcEditDlqFailureAndRestoreSource(
            UUID projectId,
            UUID sourceRevisionId,
            UUID requestedBy,
            String failureMessage
    ) {
        notifyIfcEditFailureToUser(requestedBy, ErrorCode.IFC_EDIT_COMMAND_DLQ, failureMessage);

        if (projectId == null || sourceRevisionId == null) {
            log.warn("Skip IFC_EDIT DLQ rollback relay because projectId/sourceRevisionId is missing. projectId={}, sourceRevisionId={}",
                    projectId, sourceRevisionId);
            return;
        }

        ProjectWorkspace workspace;
        try {
            workspace = resolveWorkspaceOrThrow(projectId);
        } catch (CustomException exception) {
            log.warn("Skip IFC_EDIT DLQ rollback relay because workspace is missing. projectId={}", projectId, exception);
            return;
        }

        String sourceRevisionIdText = sourceRevisionId.toString();
        String latestRevisionId = workspace.getCurrentRevision();
        if (latestRevisionId != null && !latestRevisionId.isBlank() && !sourceRevisionIdText.equals(latestRevisionId)) {
            log.info("Skip stale IFC_EDIT DLQ rollback relay. projectId={}, latestRevisionId={}, sourceRevisionId={}",
                    projectId, latestRevisionId, sourceRevisionIdText);
            return;
        }

        JsonNode rollbackPayload = resolveFloorPlanSnapshotPayloadForRevision(projectId, sourceRevisionIdText);
        if (rollbackPayload == null) {
            rollbackPayload = buildGenerateCompletionPayload(sourceRevisionId, null);
        } else if (rollbackPayload instanceof ObjectNode payloadObject) {
            payloadObject.put("revisionId", sourceRevisionIdText);
        }

        String sourceIfcS3Url = "projects/%s/revisions/%s/ifc/model.v1.ifc".formatted(projectId, sourceRevisionId);
        broadcastFloorPlanSync(
                projectId,
                workspace,
                ACTION_FLOOR_PLAN_UPDATED,
                sourceRevisionIdText,
                rollbackPayload,
                sourceIfcS3Url
        );

        log.info("Relayed IFC_EDIT DLQ rollback floor-plan sync. projectId={}, sourceRevisionId={}",
                projectId, sourceRevisionId);
    }

    /**
     * 2D/3D 도면 Undo 요청을 Redis history에서 복원해 브로드캐스트한다.
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
     * 2D/3D 도면 Redo 요청을 Redis history에서 복원해 브로드캐스트한다.
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

    /**
     * floor-plan draft를 direct ifcedit 작업으로 비동기 요청한다.
     *
     * @param projectId 프로젝트 ID
     * @param currentUserId 요청 사용자 ID
     * @param revisionId 기준 revision ID
     * @param workspaceCommand ifcedit 엔진 요청 command
     * @param sourceScenePayload floor-plan source scene payload
     * @return 작업이 큐에 정상 등록되면 true, 충돌로 스킵되면 false
     */
    private FloorPlanIfcEditQueueResult requestPythonRenderAsync(
            UUID projectId,
            UUID currentUserId,
            String revisionId,
            Integer baseIndex,
            FloorPlanSceneType sceneType,
            WorkspaceCommand workspaceCommand,
            JsonNode sourceScenePayload
    ) {
        UUID baseRevisionId = parseRevisionIdOrThrow(revisionId);
        String requestId = "floor-plan-realtime-" + UUID.randomUUID();
        JsonNode engineRequest = engineRequestMapper.toEngineRequest(
                requestId,
                projectId,
                baseRevisionId,
                List.of(toWorkspaceCommandEnvelope(
                        requestId,
                        projectId,
                        baseRevisionId,
                        baseIndex,
                        sceneType,
                        currentUserId,
                        workspaceCommand
                ))
        );
        if (engineRequest == null) {
            log.info(
                    "Skip floor-plan realtime IFC edit enqueue because mapped engine request is null. projectId={}, baseRevisionId={}, op={}, entity={}",
                    projectId,
                    baseRevisionId,
                    workspaceCommand.op(),
                    workspaceCommand.entity()
            );
            return FloorPlanIfcEditQueueResult.SKIPPED_EMPTY_OPERATIONS;
        }
        JsonNode operations = engineRequest.get("operations");
        if (operations == null || !operations.isArray() || operations.isEmpty()) {
            log.info(
                    "Skip floor-plan realtime IFC edit enqueue because mapped operations are empty. projectId={}, baseRevisionId={}, op={}, entity={}",
                    projectId,
                    baseRevisionId,
                    workspaceCommand.op(),
                    workspaceCommand.entity()
            );
            return FloorPlanIfcEditQueueResult.SKIPPED_EMPTY_OPERATIONS;
        }

        DirectIfcEditRequest directRequest = new DirectIfcEditRequest(
                DIRECT_IFC_SCHEMA_VERSION,
                UUID.randomUUID(),
                baseRevisionId,
                null,
                IfcEditConstants.SCENE_TYPE_IFC_MODEL,
                new WorkspaceCommand(
                        "create",
                        "ifcBatch",
                        requestId,
                        engineRequest,
                        null,
                        System.currentTimeMillis()
                )
        );
        try {
            directIfcEditCommandService.createDirectIfcEdit(projectId, currentUserId, directRequest, sourceScenePayload);
            log.info("Workspace floor-plan realtime request routed to DirectIfcEditCommandService. projectId={}, baseRevisionId={}",
                    projectId, baseRevisionId);
            return FloorPlanIfcEditQueueResult.QUEUED;
        } catch (CustomException exception) {
            if (exception.getErrorCode() == ErrorCode.IFC_EDIT_JOB_CONFLICT) {
                return FloorPlanIfcEditQueueResult.CONFLICT;
            }
            throw exception;
        }
    }

    private WorkspaceCommandEnvelope toWorkspaceCommandEnvelope(
            String requestId,
            UUID projectId,
            UUID baseRevisionId,
            Integer baseIndex,
            FloorPlanSceneType sceneType,
            UUID currentUserId,
            WorkspaceCommand workspaceCommand
    ) {
        return new WorkspaceCommandEnvelope(
                "command",
                "v1",
                UUID.randomUUID(),
                projectId,
                baseRevisionId,
                baseIndex == null ? UNKNOWN_FLOOR_PLAN_BASE_INDEX : baseIndex,
                workspaceCommand,
                new WorkspaceCommandMeta(
                        sceneType == FloorPlanSceneType.THREE_D ? "3d" : "2d",
                        requestId,
                        currentUserId == null ? null : currentUserId.toString(),
                        OffsetDateTime.now(ZoneOffset.UTC).toString()
                )
        );
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

    /**
     * 실시간 floor-plan 요청에 포함된 workspace command를 검증한다.
     *
     * @param pathProjectId STOMP 경로 프로젝트 ID
     * @param currentUserId 인증 사용자 ID
     * @param workspaceCommand 클라이언트 명령
     */
    private void validateEnvelope(UUID pathProjectId, UUID currentUserId, WorkspaceCommand workspaceCommand) {
        if (pathProjectId == null) {
            throw new CustomException(ErrorCode.INVALID_REQUEST, "projectId is required.");
        }
        if (currentUserId == null) {
            throw new CustomException(ErrorCode.UNAUTHORIZED);
        }
        if (workspaceCommand == null) {
            throw new CustomException(ErrorCode.INVALID_REQUEST, "workspaceCommand is required.");
        }

        if ("update".equals(workspaceCommand.op())
                && (workspaceCommand.patch() == null
                || !workspaceCommand.patch().isObject()
                || workspaceCommand.patch().isEmpty())) {
            throw new CustomException(
                    ErrorCode.INVALID_REQUEST,
                    "update command patch must include at least one field."
            );
        }

        if ("create".equals(workspaceCommand.op())
                && (workspaceCommand.data() == null || !workspaceCommand.data().isObject())) {
            throw new CustomException(
                    ErrorCode.INVALID_REQUEST,
                    "create command data is required."
            );
        }

        String entity = workspaceCommand.entity();
        if (!"create".equals(workspaceCommand.op())
                && ("wall".equals(entity)
                || "door".equals(entity)
                || "window".equals(entity)
                || "opening".equals(entity)
                || "ifcElement".equals(entity))
                && (workspaceCommand.id() == null || workspaceCommand.id().isBlank())) {
            throw new CustomException(
                    ErrorCode.INVALID_REQUEST,
                    "existing IFC element command id/globalId is required."
            );
        }
    }

    private String resolveRevisionId(String requestRevisionId, String workspaceRevisionId) {
        if (requestRevisionId != null && !requestRevisionId.isBlank()) {
            return requestRevisionId.trim();
        }
        return workspaceRevisionId;
    }

    private JsonNode buildSyncPayload(FloorPlanRealtimeUpdateRequest request, String resolvedRevisionId) {
        JsonNode bubbleSnapshot = bubbleSnapshotHelper.buildSnapshot(request);

        ObjectNode root = objectMapper.createObjectNode();
        root.put("baseIndex", request.baseIndex());
        if (resolvedRevisionId != null) {
            root.put("revisionId", resolvedRevisionId);
        } else {
            root.putNull("revisionId");
        }
        root.put("sceneType", request.sceneType().name());
        root.set("bubbles", bubbleSnapshot.get("bubbles"));
        root.set("connections", bubbleSnapshot.get("connections"));
        root.set("zones", bubbleSnapshot.get("zones"));
        root.set("floorMeta", bubbleSnapshot.get("floorMeta"));
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
        fallbackPayload.putNull("floorMeta");
        fallbackPayload.putNull("layout");
        return fallbackPayload;
    }

    /**
     * IFC_EDIT 비동기 실패를 사용자 개인 에러 채널로 전달한다.
     *
     * @param requestedBy 알림 대상 사용자 ID
     * @param errorCode 응답 코드
     * @param failureMessage 사용자에게 전달할 메시지
     */
    public void notifyIfcEditFailureToUser(UUID requestedBy, ErrorCode errorCode, String failureMessage) {
        if (requestedBy == null) {
            return;
        }

        ErrorCode resolvedErrorCode = errorCode == null ? ErrorCode.INTERNAL_SERVER_ERROR : errorCode;
        String resolvedMessage = (failureMessage == null || failureMessage.isBlank())
                ? resolvedErrorCode.getMessage()
                : failureMessage;

        ErrorResponse response = ErrorResponse.builder()
                .status(resolvedErrorCode.getStatus().value())
                .code(resolvedErrorCode.getCode())
                .message(resolvedMessage)
                .build();

        simpMessagingTemplate.convertAndSendToUser(requestedBy.toString(), "/queue/errors", response);
    }

    private JsonNode resolveFloorPlanSnapshotPayloadForRevision(UUID projectId, String revisionId) {
        try {
            int historySize = workspaceBubbleSnapshotRedisRepository.getFloorPlanSnapshotHistorySize(projectId);
            if (historySize <= 0) {
                return null;
            }

            for (int index = historySize - 1; index >= 0; index--) {
                JsonNode snapshot = workspaceBubbleSnapshotRedisRepository.findFloorPlanSnapshotByIndex(projectId, index);
                if (snapshot == null || snapshot.isNull() || !snapshot.isObject()) {
                    continue;
                }

                JsonNode payload = snapshot.get("floorPlanPayloadJson");
                if (payload == null || payload.isNull() || !payload.isObject()) {
                    continue;
                }

                JsonNode payloadRevisionIdNode = payload.get("revisionId");
                if (payloadRevisionIdNode == null || payloadRevisionIdNode.isNull()) {
                    continue;
                }

                if (revisionId.equals(payloadRevisionIdNode.asText())) {
                    return payload.deepCopy();
                }
            }
        } catch (JsonProcessingException exception) {
            log.warn("Failed to parse floor-plan snapshot while handling IFC_EDIT DLQ rollback. projectId={}, revisionId={}",
                    projectId, revisionId, exception);
            return null;
        } catch (DataAccessException exception) {
            log.warn("Failed to read floor-plan snapshot while handling IFC_EDIT DLQ rollback. projectId={}, revisionId={}",
                    projectId, revisionId, exception);
            return null;
        }

        return null;
    }

    /**
     * generate 완료 시점에 WebSocket sync 응답 포맷을 맞추기 위한 최소 payload를 생성한다.
     *
     * @param revisionId 완료된 revision ID
     * @param parentRevisionId 부모 revision ID
     * @return 클라이언트 sync 응답에 포함할 최소 floor-plan payload
     */
    private JsonNode buildGenerateCompletionPayload(UUID revisionId, UUID parentRevisionId) {
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("baseIndex", -1);
        payload.put("revisionId", revisionId.toString());
        if (parentRevisionId != null) {
            payload.put("parentRevisionId", parentRevisionId.toString());
        } else {
            payload.putNull("parentRevisionId");
        }
        payload.put("sceneType", "THREE_D");
        payload.set("bubbles", objectMapper.createArrayNode());
        payload.set("connections", objectMapper.createArrayNode());
        payload.putNull("floorMeta");
        payload.putNull("layout");
        return payload;
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
        String broadcastS3Url = resolveBroadcastIfcUrl(s3Url);

        FloorPlanProjectSyncResponse response = new FloorPlanProjectSyncResponse(
                action,
                projectId,
                workspace.getPhaseStatus(),
                revisionId,
                floorPlanPayloadJson,
                broadcastS3Url,
                LocalDateTime.now()
        );

        simpMessagingTemplate.convertAndSend(
                PROJECT_FLOOR_PLAN_SYNC_TOPIC_TEMPLATE.formatted(projectId),
                response
        );
    }

    /**
     * WebSocket으로 내려줄 IFC URL을 브라우저가 접근 가능한 presigned URL로 변환한다.
     *
     * <p>변환에 실패해도 실시간 동기화 자체는 막지 않고 원본 URL을 반환한다.
     *
     * @param s3Url 원본 IFC 저장 경로
     * @return 브라우저 접근 가능한 IFC URL
     */
    private String resolveBroadcastIfcUrl(String s3Url) {
        if (s3Url == null || s3Url.isBlank()) {
            return s3Url;
        }

        try {
            return s3ObjectPresigner.presignIfInternal(s3Url, ErrorCode.WORKSPACE_IFC_EXPORT_PRESIGN_FAILED);
        } catch (CustomException exception) {
            log.warn("Failed to presign floor-plan IFC URL for websocket sync. rawS3Url={}", s3Url, exception);
            return s3Url;
        }
    }

    /**
     * Redis history에서 제거된 snapshot의 S3 URL을 삭제 대기열에 넣는다.
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
     * 제거 대상 snapshot payload에서 유효한 s3Url만 추출한다.
     *
     * @param garbagePayloads history에서 제거된 snapshot payload 목록
     * @return 삭제 대기열에 넣을 S3 URL 목록
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

    private enum FloorPlanIfcEditQueueResult {
        QUEUED,
        SKIPPED_EMPTY_OPERATIONS,
        CONFLICT
    }

    private record FloorPlanHistorySnapshot(String revisionId, JsonNode floorPlanPayloadJson, String s3Url) {
    }
}
