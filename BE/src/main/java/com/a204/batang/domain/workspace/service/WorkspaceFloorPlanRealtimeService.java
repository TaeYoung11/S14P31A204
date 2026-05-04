package com.a204.batang.domain.workspace.service;

import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.domain.workspace.dto.FloorPlanProjectSyncResponse;
import com.a204.batang.domain.workspace.dto.FloorPlanRealtimeUpdateRequest;
import com.a204.batang.domain.workspace.dto.PublishFloorPlanUpdatedRequest;
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
import java.util.UUID;

/**
 * 2D/3D 실시간 편집 STOMP 동기화를 처리한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WorkspaceFloorPlanRealtimeService {

    private static final String PROJECT_FLOOR_PLAN_SYNC_TOPIC_TEMPLATE = "/topic/project/%s/floor-plan/sync";
    private static final String ACTION_FLOOR_PLAN_PROCESSING = "FLOOR_PLAN_PROCESSING";
    private static final String ACTION_FLOOR_PLAN_UPDATED = "FLOOR_PLAN_UPDATED";

    private final ProjectWorkspaceRepository projectWorkspaceRepository;
    private final ProjectAccessService projectAccessService;
    private final BubbleSnapshotHelper bubbleSnapshotHelper;
    private final SimpMessagingTemplate simpMessagingTemplate;
    private final ObjectMapper objectMapper;

    /**
     * 2D/3D 실시간 편집 draft 수신 시 처리 중 상태를 브로드캐스트한다.
     * 파이썬 렌더링 완료 후 업데이트 완료 이벤트는 webhook 진입점에서 별도로 발행한다.
     *
     * @param projectId 프로젝트 ID
     * @param currentUserId 현재 사용자 ID
     * @param request 실시간 편집 요청 payload
     */
    public void relayFloorPlanDraft(UUID projectId, UUID currentUserId, FloorPlanRealtimeUpdateRequest request) {
        validateRealtimePayloadOrThrow(request);

        ProjectWorkspace workspace = projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId)
                .orElseThrow(() -> new CustomException(ErrorCode.PROJECT_NOT_FOUND));

        // STOMP 인터셉터와 동일한 규칙으로 서비스 레이어에서도 한 번 더 인가를 보장한다.
        projectAccessService.validateProjectPinWriterOrThrow(projectId, currentUserId);

        String resolvedRevisionId = resolveRevisionId(request.revisionId(), workspace.getCurrentRevision());
        JsonNode syncPayload = buildSyncPayload(request, resolvedRevisionId);

        requestPythonRenderAsync(projectId, resolvedRevisionId, syncPayload);

        FloorPlanProjectSyncResponse response = new FloorPlanProjectSyncResponse(
                ACTION_FLOOR_PLAN_PROCESSING,
                projectId,
                workspace.getPhaseStatus(),
                resolvedRevisionId,
                syncPayload,
                null,
                LocalDateTime.now()
        );

        simpMessagingTemplate.convertAndSend(
                PROJECT_FLOOR_PLAN_SYNC_TOPIC_TEMPLATE.formatted(projectId),
                response
        );

        log.info("Floor-plan processing event relayed. projectId={}, revisionId={}", projectId, resolvedRevisionId);
    }

    /**
     * 파이썬 완료 콜백 수신 후 업데이트 완료 이벤트를 브로드캐스트한다.
     *
     * @param projectId 프로젝트 ID
     * @param request 파이썬 완료 콜백 payload
     */
    @Transactional
    public void publishFloorPlanUpdated(UUID projectId, PublishFloorPlanUpdatedRequest request) {
        ProjectWorkspace workspace = projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId)
                .orElseThrow(() -> new CustomException(ErrorCode.PROJECT_NOT_FOUND));

        workspace.updateIfcStorageUrl(request.s3Url().trim());

        String resolvedRevisionId = resolveRevisionId(request.revisionId(), workspace.getCurrentRevision());
        FloorPlanProjectSyncResponse response = new FloorPlanProjectSyncResponse(
                ACTION_FLOOR_PLAN_UPDATED,
                projectId,
                workspace.getPhaseStatus(),
                resolvedRevisionId,
                request.floorPlanPayloadJson(),
                request.s3Url().trim(),
                LocalDateTime.now()
        );

        simpMessagingTemplate.convertAndSend(
                PROJECT_FLOOR_PLAN_SYNC_TOPIC_TEMPLATE.formatted(projectId),
                response
        );

        log.info("Floor-plan updated event relayed. projectId={}, revisionId={}", projectId, resolvedRevisionId);
    }

    private void requestPythonRenderAsync(UUID projectId, String revisionId, JsonNode syncPayload) {
        // TODO: 파이썬 서버 비동기 요청 연동
        // 1) projectId, revisionId, syncPayload를 파이썬 서비스에 비동기로 전달
        // 2) 파이썬 처리 완료 시 /api/v1/projects/{projectId}/workspace/floor-plan/webhook 으로 콜백
        // 3) 실패/타임아웃/재시도 정책은 비동기 큐(또는 워커) 레벨에서 관리
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
        root.set("bubbles", objectMapper.valueToTree(request.bubbles()));
        root.set("connections", objectMapper.valueToTree(request.connections()));
        if (request.layout() != null) {
            root.set("layout", request.layout());
        } else {
            root.putNull("layout");
        }
        return root;
    }
}
