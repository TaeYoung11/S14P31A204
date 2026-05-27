package com.a204.batang.domain.ifcedit.service;

import com.a204.batang.domain.ifcedit.dto.DirectIfcEditRequest;
import com.a204.batang.domain.ifcedit.dto.IfcEditJobResponse;
import com.a204.batang.domain.ifcedit.dto.IfcEditStatusSseResponse;
import com.a204.batang.domain.ifcedit.entity.IfcEditJob;
import com.a204.batang.domain.ifcedit.entity.IfcEditJobStep;
import com.a204.batang.domain.ifcedit.messaging.dto.IfcEditCommandMessage;
import com.a204.batang.domain.ifcedit.messaging.event.IfcEditCommandPublishRequestedEvent;
import com.a204.batang.domain.ifcedit.messaging.event.IfcEditStatusChangedEvent;
import com.a204.batang.domain.ifcedit.repository.IfcEditArtifactRepository;
import com.a204.batang.domain.ifcedit.repository.IfcEditJobRepository;
import com.a204.batang.domain.ifcedit.repository.IfcEditJobStepRepository;
import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.repository.ProjectRepository;
import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.domain.revision.entity.Revision;
import com.a204.batang.domain.revision.repository.RevisionRepository;
import com.a204.batang.domain.workspace.dto.WorkspaceCommand;
import com.a204.batang.global.config.RabbitMqConfig;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static com.a204.batang.domain.ifcedit.IfcEditConstants.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class DirectIfcEditCommandService {

    private final ProjectRepository projectRepository;
    private final RevisionRepository revisionRepository;
    private final ProjectAccessService projectAccessService;
    private final IfcEditJobRepository ifcEditJobRepository;
    private final IfcEditJobStepRepository ifcEditJobStepRepository;
    private final IfcEditArtifactRepository ifcEditArtifactRepository;
    private final IfcEditActiveJobGuard ifcEditActiveJobGuard;
    private final IfcEditStoragePathBuilder pathBuilder;
    private final ApplicationEventPublisher eventPublisher;
    private final ObjectMapper objectMapper;

    @Transactional
    public IfcEditJobResponse createDirectIfcEdit(UUID projectId, UUID userId, DirectIfcEditRequest request) {
        return createDirectIfcEdit(projectId, userId, request, null);
    }

    @Transactional
    public IfcEditJobResponse createDirectIfcEdit(
            UUID projectId,
            UUID userId,
            DirectIfcEditRequest request,
            JsonNode sourceScenePayload
    ) {
        Project project = projectRepository.findByProjectIdAndDeletedAtIsNullForUpdate(projectId)
                .orElseThrow(() -> new CustomException(ErrorCode.PROJECT_NOT_FOUND));

        UUID currentUserId = Optional.ofNullable(userId)
                .orElseGet(projectAccessService::resolveCurrentUserIdOrThrow);
        projectAccessService.validateProjectOwnerOrThrow(project, currentUserId);

        boolean hasActive = ifcEditActiveJobGuard.hasBlockingActiveJob(projectId);
        if (hasActive) {
            throw new CustomException(ErrorCode.IFC_EDIT_JOB_CONFLICT);
        }

        Revision sourceRevision = revisionRepository.findById(request.baseRevisionId())
                .orElseThrow(() -> new CustomException(ErrorCode.IFC_EDIT_SOURCE_NOT_FOUND));

        UUID jobId = UUID.randomUUID();
        UUID jobStepId = UUID.randomUUID();
        UUID targetRevisionId = UUID.randomUUID();
        UUID expectedOutputArtifactId = UUID.randomUUID();
        UUID correlationId = UUID.randomUUID();
        String idempotencyKey = jobId + ":step-1:ifc-edit-apply";

        int nextRevisionNo = revisionRepository.findTopByProjectIdOrderByRevisionNoDesc(projectId)
                .map(r -> r.getRevisionNo() + 1)
                .orElse(1);

        String sourceIfcUrl = resolveSourceIfcStorageUrl(projectId, sourceRevision);
        String outputIfcUrl = pathBuilder.buildOutputIfcStorageUrl(projectId, targetRevisionId);
        String validationUrl = pathBuilder.buildValidationReportStorageUrl(projectId, jobId, 1);
        String sceneSnapshotUrl = pathBuilder.buildSceneSnapshotStorageUrl(projectId, targetRevisionId, request.sourceSceneType());

        Map<String, Object> inputMap = new LinkedHashMap<>();
        inputMap.put("sourceRevisionId", request.baseRevisionId().toString());
        inputMap.put("targetRevisionId", targetRevisionId.toString());
        inputMap.put("expectedOutputArtifactId", expectedOutputArtifactId.toString());
        inputMap.put("sourceIfcStorageUrl", sourceIfcUrl);
        inputMap.put("ifcStorageUrl", outputIfcUrl);
        inputMap.put("validationReportStorageUrl", validationUrl);
        inputMap.put("sceneSnapshotStorageUrl", sceneSnapshotUrl);
        inputMap.put("revisionNo", nextRevisionNo);
        JsonNode inputPayload = objectMapper.valueToTree(inputMap);

        JsonNode resolvedEngineRequestPayload = resolveEngineRequestPayload(request.engineRequest());

        Map<String, Object> jobPayloadMap = new LinkedHashMap<>();
        jobPayloadMap.put("engineRequest", resolvedEngineRequestPayload);
        if (sourceScenePayload != null && !sourceScenePayload.isNull()) {
            jobPayloadMap.put("sourceScenePayload", sourceScenePayload);
        }
        JsonNode requestPayload = objectMapper.valueToTree(jobPayloadMap);

        Map<String, Object> workerPayloadMap = new LinkedHashMap<>();
        workerPayloadMap.put("engineRequest", resolvedEngineRequestPayload);
        JsonNode workerPayload = objectMapper.valueToTree(workerPayloadMap);

        logResolvedEngineRequest(projectId, jobId, request.baseRevisionId(), resolvedEngineRequestPayload);

        LocalDateTime now = LocalDateTime.now();
        Revision revision = Revision.createCreating(
                targetRevisionId, projectId, project.getLatestRevisionId(),
                nextRevisionNo, currentUserId, null, null, now
        );
        IfcEditJob job = IfcEditJob.createQueued(
                jobId, projectId, currentUserId,
                request.sourceSceneStateId(), request.baseRevisionId(),
                request.sourceSceneType(), JOB_TYPE_IFC_EDIT, requestPayload, now
        );
        IfcEditJobStep step = IfcEditJobStep.createQueued(
                jobStepId, jobId, 1,
                WORKER_TYPE_IFC_EDIT_APPLY, RabbitMqConfig.IFC_EDIT_COMMAND_ROUTING_KEY,
                idempotencyKey, inputPayload, now
        );

        revisionRepository.save(revision);
        ifcEditJobRepository.save(job);
        ifcEditJobStepRepository.save(step);

        IfcEditCommandMessage cmd = new IfcEditCommandMessage(
                UUID.randomUUID(), MESSAGE_SCHEMA_VERSION, MESSAGE_TYPE_COMMAND,
                COMMAND_TYPE_IFC_EDIT_APPLY, RabbitMqConfig.IFC_EDIT_COMMAND_ROUTING_KEY,
                jobId, jobStepId, 1, TOTAL_STEPS_DIRECT, projectId, currentUserId,
                request.baseRevisionId(), request.sourceSceneStateId(), request.sourceSceneType(),
                targetRevisionId, expectedOutputArtifactId,
                Map.of("source_ifc_storage_url", sourceIfcUrl),
                new IfcEditCommandMessage.ExpectedOutput(outputIfcUrl, validationUrl, null, null),
                workerPayload, ATTEMPT_NO, MAX_ATTEMPTS, idempotencyKey, correlationId,
                OffsetDateTime.now(ZoneOffset.UTC)
        );

        log.info("IFC Edit 작업을 예약합니다. projectId={}, jobId={}, jobStepId={}, targetRevisionId={}, jobType={}",
                projectId, jobId, jobStepId, targetRevisionId, JOB_TYPE_IFC_EDIT);
        log.info("IFC Edit command 발행을 예약합니다. routingKey={}, correlationId={}",
                RabbitMqConfig.IFC_EDIT_COMMAND_ROUTING_KEY, correlationId);

        eventPublisher.publishEvent(new IfcEditCommandPublishRequestedEvent(cmd));
        eventPublisher.publishEvent(new IfcEditStatusChangedEvent(
                projectId,
                SSE_IFC_EDIT_QUEUED,
                new IfcEditStatusSseResponse(
                        SSE_IFC_EDIT_QUEUED, projectId, jobId, jobStepId, targetRevisionId,
                        JOB_TYPE_IFC_EDIT, "QUEUED", 0, null
                )
        ));

        return new IfcEditJobResponse(
                projectId, jobId, jobStepId, targetRevisionId, expectedOutputArtifactId,
                JOB_TYPE_IFC_EDIT, "QUEUED", 0
        );
    }

    private JsonNode resolveEngineRequestPayload(WorkspaceCommand engineRequest) {
        if (engineRequest == null) {
            return null;
        }

        if ("ifcBatch".equals(engineRequest.entity())
                && engineRequest.data() != null
                && engineRequest.data().isObject()) {
            return engineRequest.data();
        }

        return objectMapper.valueToTree(engineRequest);
    }

    private void logResolvedEngineRequest(
            UUID projectId,
            UUID jobId,
            UUID baseRevisionId,
            JsonNode engineRequest
    ) {
        JsonNode operations = engineRequest == null ? null : engineRequest.get("operations");
        int operationCount = operations != null && operations.isArray() ? operations.size() : 0;
        String schemaVersion = engineRequest == null ? null : engineRequest.path("schema_version").asText(null);
        log.info(
                "Resolved IFC edit engine request. projectId={}, jobId={}, baseRevisionId={}, schemaVersion={}, operationCount={}, operationTypes={}, selectorIds={}, rotationDeg={}",
                projectId,
                jobId,
                baseRevisionId,
                schemaVersion,
                operationCount,
                summarizeOperationTypes(operations),
                summarizeSelectorIds(operations),
                summarizeRotationDeg(operations)
        );
        if (log.isDebugEnabled()) {
            log.debug(
                    "Resolved IFC edit engine request JSON. projectId={}, jobId={}, engineRequest={}",
                    projectId,
                    jobId,
                    engineRequest
            );
        }
    }

    private String summarizeOperationTypes(JsonNode operations) {
        if (operations == null || !operations.isArray()) {
            return "[]";
        }
        StringBuilder summary = new StringBuilder("[");
        for (int i = 0; i < operations.size(); i++) {
            if (i > 0) {
                summary.append(", ");
            }
            JsonNode type = operations.get(i).get("type");
            summary.append(type == null || type.isNull() ? "<missing>" : type.asText());
        }
        return summary.append("]").toString();
    }

    private String summarizeSelectorIds(JsonNode operations) {
        if (operations == null || !operations.isArray()) {
            return "[]";
        }
        StringBuilder summary = new StringBuilder("[");
        boolean first = true;
        for (JsonNode operation : operations) {
            JsonNode ids = operation.at("/selector/global_ids");
            if (ids == null || !ids.isArray()) {
                continue;
            }
            for (JsonNode id : ids) {
                if (!first) {
                    summary.append(", ");
                }
                summary.append(id.asText());
                first = false;
            }
        }
        return summary.append("]").toString();
    }

    private String summarizeRotationDeg(JsonNode operations) {
        if (operations == null || !operations.isArray()) {
            return "[]";
        }
        StringBuilder summary = new StringBuilder("[");
        boolean first = true;
        for (JsonNode operation : operations) {
            JsonNode rotation = operation.at("/parameters/rotation_deg");
            if (rotation == null || rotation.isMissingNode() || rotation.isNull()) {
                continue;
            }
            if (!first) {
                summary.append(", ");
            }
            summary.append(rotation);
            first = false;
        }
        return summary.append("]").toString();
    }

    private String resolveSourceIfcStorageUrl(UUID projectId, Revision sourceRevision) {
        Revision cursor = sourceRevision;
        Set<UUID> visitedRevisionIds = new HashSet<>();

        while (cursor != null && visitedRevisionIds.add(cursor.getRevisionId())) {
            Optional<String> artifactStorageUrl = ifcEditArtifactRepository
                    .findTopByProjectIdAndRevisionIdAndArtifactTypeOrderByCreatedAtDescArtifactIdDesc(
                            projectId,
                            cursor.getRevisionId(),
                            ARTIFACT_TYPE_IFC_MODEL
                    )
                    .map(artifact -> artifact.getStorageUrl())
                    .filter(storageUrl -> storageUrl != null && !storageUrl.isBlank());

            if (artifactStorageUrl.isPresent()) {
                if (!cursor.getRevisionId().equals(sourceRevision.getRevisionId())) {
                    log.info(
                            "Resolved IFC edit source artifact from ancestor revision. projectId={}, requestedRevisionId={}, artifactRevisionId={}",
                            projectId,
                            sourceRevision.getRevisionId(),
                            cursor.getRevisionId()
                    );
                }
                return pathBuilder.toWorkerStorageUrl(artifactStorageUrl.get());
            }

            UUID parentRevisionId = cursor.getParentRevisionId();
            if (parentRevisionId == null) {
                break;
            }
            cursor = revisionRepository.findById(parentRevisionId).orElse(null);
        }

        return pathBuilder.buildSourceIfcStorageUrl(projectId, sourceRevision.getRevisionId());
    }
}
