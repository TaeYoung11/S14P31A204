package com.a204.batang.domain.workspace.service;

import com.a204.batang.domain.workspace.dto.SaveBubbleSnapshotRequest;
import com.a204.batang.domain.workspace.dto.SaveBubbleSnapshotResponse;
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
 * 버블 다이어그램의 명시적 저장(확정) 기능을 처리한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WorkspaceCommandService {

    private final ProjectWorkspaceRepository projectWorkspaceRepository;
    private final BubbleSnapshotHelper bubbleSnapshotHelper;

    /**
     * 프런트엔드의 저장 API 호출 시 버블 스냅샷을 DB에 반영한다.
     *
     * @param projectId 프로젝트 ID
     * @param request 저장 요청 payload
     * @return 저장 결과 응답
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
}
