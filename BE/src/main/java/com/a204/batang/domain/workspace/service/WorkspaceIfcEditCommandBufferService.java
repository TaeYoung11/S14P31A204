package com.a204.batang.domain.workspace.service;

import com.a204.batang.domain.ifcedit.IfcEditConstants;
import com.a204.batang.domain.ifcedit.dto.DirectIfcEditRequest;
import com.a204.batang.domain.ifcedit.service.DirectIfcEditCommandService;
import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.repository.ProjectRepository;
import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.domain.revision.repository.RevisionRepository;
import com.a204.batang.domain.workspace.dto.WorkspaceCommandAckResponse;
import com.a204.batang.domain.workspace.dto.WorkspaceCommandEnvelope;
import com.a204.batang.domain.workspace.dto.WorkspaceCommandMeta;
import com.a204.batang.domain.workspace.repository.WorkspaceIfcEditCommandRedisRepository;
import com.a204.batang.domain.workspace.repository.WorkspaceBubbleSnapshotRedisRepository;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class WorkspaceIfcEditCommandBufferService {

    private static final long DEBOUNCE_MILLIS = 800L;

    private final ProjectRepository projectRepository;
    private final RevisionRepository revisionRepository;
    private final ProjectAccessService projectAccessService;
    private final WorkspaceIfcEditCommandRedisRepository commandRedisRepository;
    private final WorkspaceBubbleSnapshotRedisRepository snapshotRedisRepository;
    private final FloorPlanIfcEditEngineRequestMapper engineRequestMapper;
    private final DirectIfcEditCommandService directIfcEditCommandService;

    @Transactional
    public WorkspaceCommandAckResponse acceptCommand(UUID pathProjectId, UUID currentUserId, WorkspaceCommandEnvelope envelope) {
        validateEnvelope(pathProjectId, currentUserId, envelope);

        Project project = projectRepository.findByProjectIdAndDeletedAtIsNull(pathProjectId)
                .orElseThrow(() -> new CustomException(ErrorCode.PROJECT_NOT_FOUND));
        projectAccessService.validateProjectOwnerOrThrow(project, currentUserId);
        if (project.getLatestRevisionId() != null && !project.getLatestRevisionId().equals(envelope.baseRevisionId())) {
            throw new CustomException(ErrorCode.CONCURRENT_MODIFICATION, "baseRevisionId is stale.");
        }

        try {
            WorkspaceCommandEnvelope normalizedEnvelope = withServerUserId(envelope, currentUserId);
            var result = commandRedisRepository.buffer(pathProjectId, currentUserId, normalizedEnvelope);
            if (result.duplicate()) {
                return WorkspaceCommandAckResponse.duplicate(envelope.commandId());
            }
            if (isImmediateFlush(envelope)) {
                flushBatch(result.batchKey());
            }
            return WorkspaceCommandAckResponse.accepted(envelope.commandId());
        } catch (JsonProcessingException exception) {
            throw new CustomException(ErrorCode.INVALID_REQUEST, "Workspace command serialization failed.");
        }
    }

    @Scheduled(fixedDelay = 1000L)
    public void flushReadyBatches() {
        long now = System.currentTimeMillis();
        for (String batchKey : commandRedisRepository.findPendingBatchKeys()) {
            long lastUpdatedAt = commandRedisRepository.lastUpdatedAt(batchKey);
            if (lastUpdatedAt <= 0 || now - lastUpdatedAt < DEBOUNCE_MILLIS) {
                continue;
            }
            try {
                flushBatch(batchKey);
            } catch (CustomException exception) {
                log.warn("Workspace IFC edit command batch flush skipped. batchKey={}, code={}",
                        batchKey, exception.getErrorCode().getCode());
            } catch (Exception exception) {
                log.warn("Workspace IFC edit command batch flush failed. batchKey={}", batchKey, exception);
            }
        }
    }

    private void flushBatch(String batchKey) throws JsonProcessingException {
        List<WorkspaceCommandEnvelope> batch = commandRedisRepository.findBatch(batchKey);
        if (batch.isEmpty()) {
            commandRedisRepository.clearBatch(batchKey);
            return;
        }

        WorkspaceCommandEnvelope first = batch.get(0);
        if (revisionRepository.findById(first.baseRevisionId()).isEmpty()) {
            throw new CustomException(ErrorCode.IFC_EDIT_SOURCE_NOT_FOUND);
        }

        String requestId = "command-batch-" + UUID.randomUUID();
        JsonNode engineRequest = engineRequestMapper.toEngineRequest(
                requestId,
                first.projectId(),
                first.baseRevisionId(),
                batch
        );
        JsonNode operations = engineRequest.get("operations");
        if (operations == null || !operations.isArray() || operations.isEmpty()) {
            commandRedisRepository.clearBatch(batchKey);
            return;
        }

        DirectIfcEditRequest request = new DirectIfcEditRequest(
                "v1",
                UUID.randomUUID(),
                first.baseRevisionId(),
                null,
                IfcEditConstants.SCENE_TYPE_IFC_MODEL,
                engineRequest
        );
        directIfcEditCommandService.createDirectIfcEdit(
                first.projectId(),
                resolveUserId(first),
                request,
                resolveSourceScenePayload(first)
        );
        commandRedisRepository.clearBatch(batchKey);
    }

    private JsonNode resolveSourceScenePayload(WorkspaceCommandEnvelope envelope) {
        try {
            JsonNode snapshot = snapshotRedisRepository.findFloorPlanSnapshotByIndex(envelope.projectId(), envelope.baseIndex());
            if (snapshot != null && snapshot.isObject()) {
                JsonNode payload = snapshot.get("floorPlanPayloadJson");
                if (payload != null && payload.isObject()) {
                    return payload;
                }
            }
        } catch (Exception exception) {
            log.debug("Workspace IFC edit source scene payload not available. projectId={}, baseIndex={}",
                    envelope.projectId(), envelope.baseIndex(), exception);
        }
        return null;
    }

    private UUID resolveUserId(WorkspaceCommandEnvelope envelope) {
        try {
            return UUID.fromString(envelope.meta().userId());
        } catch (Exception exception) {
            return null;
        }
    }

    private WorkspaceCommandEnvelope withServerUserId(WorkspaceCommandEnvelope envelope, UUID currentUserId) {
        WorkspaceCommandMeta meta = new WorkspaceCommandMeta(
                envelope.meta().source(),
                envelope.meta().clientId(),
                currentUserId.toString(),
                envelope.meta().createdAt()
        );
        return new WorkspaceCommandEnvelope(
                envelope.type(),
                envelope.schemaVersion(),
                envelope.commandId(),
                envelope.projectId(),
                envelope.baseRevisionId(),
                envelope.baseIndex(),
                envelope.command(),
                meta
        );
    }

    private boolean isImmediateFlush(WorkspaceCommandEnvelope envelope) {
        return !"update".equals(envelope.command().op());
    }

    private void validateEnvelope(UUID pathProjectId, UUID currentUserId, WorkspaceCommandEnvelope envelope) {
        if (!pathProjectId.equals(envelope.projectId())) {
            throw new CustomException(ErrorCode.INVALID_REQUEST, "path projectId and body projectId must match.");
        }
        if (currentUserId == null) {
            throw new CustomException(ErrorCode.UNAUTHORIZED);
        }
        if (!"2d".equals(envelope.meta().source()) && !"3d".equals(envelope.meta().source())) {
            throw new CustomException(ErrorCode.INVALID_REQUEST, "meta.source must be 2d or 3d.");
        }
        if ("update".equals(envelope.command().op())
                && (envelope.command().patch() == null || !envelope.command().patch().isObject()
                || envelope.command().patch().isEmpty())) {
            throw new CustomException(ErrorCode.INVALID_REQUEST, "update command patch must include at least one field.");
        }
        if ("create".equals(envelope.command().op())
                && (envelope.command().data() == null || !envelope.command().data().isObject())) {
            throw new CustomException(ErrorCode.INVALID_REQUEST, "create command data is required.");
        }
        String entity = envelope.command().entity();
        if (!"create".equals(envelope.command().op())
                && ("wall".equals(entity) || "door".equals(entity) || "window".equals(entity)
                || "opening".equals(entity) || "ifcElement".equals(entity))
                && (envelope.command().id() == null || envelope.command().id().isBlank())) {
            throw new CustomException(ErrorCode.INVALID_REQUEST, "existing IFC element command id/globalId is required.");
        }
    }
}
