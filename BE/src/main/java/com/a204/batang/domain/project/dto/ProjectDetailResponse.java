package com.a204.batang.domain.project.dto;

import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.workspace.entity.PhaseStatus;
import com.a204.batang.domain.workspace.entity.ProjectWorkspace;
import com.fasterxml.jackson.databind.JsonNode;

import java.util.List;
import java.util.UUID;

/**
 * 프로젝트 진입(불러오기) 시 필요한 상세 정보를 반환한다.
 *
 * @param projectId 프로젝트 ID
 * @param name 프로젝트 이름
 * @param description 프로젝트 설명
 * @param phaseStatus 현재 워크스페이스 단계
 * @param bubbleEditing 버블 다이어그램 편집 중 여부
 * @param bubbleSnapshotJson 현재 저장된 버블 스냅샷
 * @param ifcStorageUrl 버블 편집 종료 후 반환하는 IFC URL
 * @param currentRevision 현재 리비전 ID 문자열
 * @param siteInfo 대지 정보
 * @param creator 프로젝트 생성자 정보
 * @param invitedUsers 초대 사용자 정보 목록
 */
public record ProjectDetailResponse(
        UUID projectId,
        String name,
        String description,
        PhaseStatus phaseStatus,
        boolean bubbleEditing,
        JsonNode bubbleSnapshotJson,
        String ifcStorageUrl,
        String currentRevision,
        ProjectSiteDetailResponse siteInfo,
        ProjectParticipantResponse creator,
        List<ProjectParticipantResponse> invitedUsers
) {

    /**
     * 프로젝트/워크스페이스 엔티티를 프로젝트 상세 응답 DTO로 변환한다.
     *
     * @param project 프로젝트 엔티티
     * @param workspace 워크스페이스 엔티티
 * @param bubbleEditing 버블 다이어그램 편집 중 여부
     * @param creator 프로젝트 생성자 정보
     * @param invitedUsers 초대 사용자 정보 목록
     * @return 프로젝트 상세 응답 DTO
     */
    public static ProjectDetailResponse from(
            Project project,
            ProjectWorkspace workspace,
            boolean bubbleEditing,
            ProjectParticipantResponse creator,
            List<ProjectParticipantResponse> invitedUsers
    ) {
        JsonNode bubbleSnapshotJson = workspace.getBubbleSnapshotJson();
        String ifcStorageUrl = bubbleEditing ? null : workspace.getIfcStorageUrl();

        return new ProjectDetailResponse(
                project.getProjectId(),
                project.getName(),
                project.getDescription(),
                workspace.getPhaseStatus(),
                bubbleEditing,
                bubbleSnapshotJson,
                ifcStorageUrl,
                workspace.getCurrentRevision(),
                ProjectSiteDetailResponse.from(project),
                creator,
                List.copyOf(invitedUsers)
        );
    }
}
