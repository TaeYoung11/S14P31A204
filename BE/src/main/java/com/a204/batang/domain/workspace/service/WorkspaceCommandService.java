package com.a204.batang.domain.workspace.service;

import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.domain.revision.entity.Revision;
import com.a204.batang.domain.revision.repository.RevisionRepository;
import com.a204.batang.domain.workspace.dto.SaveBubbleSnapshotRequest;
import com.a204.batang.domain.workspace.dto.SaveBubbleSnapshotResponse;
import com.a204.batang.domain.workspace.dto.SaveFloorPlanSnapshotRequest;
import com.a204.batang.domain.workspace.dto.SaveFloorPlanSnapshotResponse;
import com.a204.batang.domain.workspace.entity.ProjectWorkspace;
import com.a204.batang.domain.workspace.repository.ProjectWorkspaceRepository;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 워크스페이스 명시적 저장(버튼 클릭)을 처리한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WorkspaceCommandService {

    private final ProjectWorkspaceRepository projectWorkspaceRepository;
    private final BubbleSnapshotHelper bubbleSnapshotHelper;
    private final ProjectAccessService projectAccessService;
    private final RevisionRepository revisionRepository;

    /**
     * 버블 스냅샷을 DB에 저장한다.
     *
     * @param projectId 프로젝트 ID
     * @param request 저장 요청 payload
     * @return 저장 결과
     */
    @Transactional
    public SaveBubbleSnapshotResponse saveBubbleSnapshot(UUID projectId, SaveBubbleSnapshotRequest request) {
        bubbleSnapshotHelper.validatePayloadOrThrow(request);

        ProjectWorkspace workspace = projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId)
                .orElseThrow(() -> new CustomException(ErrorCode.PROJECT_NOT_FOUND));

        bubbleSnapshotHelper.validatePhaseOrThrow(workspace.getPhaseStatus());

        JsonNode snapshot = bubbleSnapshotHelper.buildSnapshot(request);
        workspace.updateBubbleSnapshot(snapshot);

        log.info("Bubble snapshot saved to DB. projectId={}", projectId);
        return new SaveBubbleSnapshotResponse(
                workspace.getProjectId(),
                workspace.getPhaseStatus(),
                LocalDateTime.now()
        );
    }

    /**
     * 2D/3D 결과물 저장 API 요청을 받아 revision과 워크스페이스 상태를 RDB에 반영한다.
     *
     * @param projectId 프로젝트 ID
     * @param request 저장 요청 payload
     * @return 저장 결과
     */
    @Transactional
    public SaveFloorPlanSnapshotResponse saveFloorPlanSnapshot(UUID projectId, SaveFloorPlanSnapshotRequest request) {
        UUID currentUserId = projectAccessService.resolveCurrentUserIdOrThrow();
        projectAccessService.validateProjectPinWriterOrThrow(projectId, currentUserId);

        ProjectWorkspace workspace = projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId)
                .orElseThrow(() -> new CustomException(ErrorCode.PROJECT_NOT_FOUND));

        UUID parentRevisionId = resolveParentRevisionId(request.revisionId(), workspace.getCurrentRevision());
        int nextRevisionNo = revisionRepository.findTopByProjectIdOrderByRevisionNoDesc(projectId)
                .map(revision -> revision.getRevisionNo() + 1)
                .orElse(1);

        UUID nextRevisionId = UUID.randomUUID();
        LocalDateTime now = LocalDateTime.now();

        Revision revision = Revision.createCreating(
                nextRevisionId,
                projectId,
                parentRevisionId,
                nextRevisionNo,
                currentUserId,
                null,
                null,
                now
        );
        revision.markSucceeded();
        revisionRepository.save(revision);

        String normalizedS3Url = request.s3Url().trim();
        workspace.updateIfcOutput(normalizedS3Url, nextRevisionId);
        workspace.getProject().updateLatestRevisionId(nextRevisionId);

        log.info(
                "Floor-plan snapshot saved to DB. projectId={}, revisionId={}, parentRevisionId={}, savedBy={}",
                projectId,
                nextRevisionId,
                parentRevisionId,
                currentUserId
        );

        return new SaveFloorPlanSnapshotResponse(
                projectId,
                workspace.getPhaseStatus(),
                nextRevisionId.toString(),
                normalizedS3Url,
                now
        );
    }

    private UUID resolveParentRevisionId(String requestRevisionId, String workspaceRevisionId) {
        if (requestRevisionId != null && !requestRevisionId.isBlank()) {
            try {
                return UUID.fromString(requestRevisionId.trim());
            } catch (IllegalArgumentException exception) {
                throw new CustomException(
                        ErrorCode.FLOOR_PLAN_OUTPUT_VALIDATION_FAILED,
                        "revisionId must be a valid UUID format."
                );
            }
        }

        if (workspaceRevisionId == null || workspaceRevisionId.isBlank()) {
            return null;
        }

        try {
            return UUID.fromString(workspaceRevisionId.trim());
        } catch (IllegalArgumentException exception) {
            log.warn("Workspace currentRevision is not UUID format. currentRevision={}", workspaceRevisionId);
            return null;
        }
    }
}
