package com.a204.batang.domain.project.dto;

import com.a204.batang.domain.auth.entity.Member;
import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.entity.ProjectMemberRole;

import java.util.UUID;

/**
 * 프로젝트 멤버 초대 응답 DTO.
 *
 * @param projectId 프로젝트 ID
 * @param invitedUserId 초대된 사용자 ID
 * @param invitedUserName 초대된 사용자 이름
 * @param invitedUserEmail 초대된 사용자 이메일
 * @param role 프로젝트 멤버 역할
 */
public record ProjectInvitationResponse(
        UUID projectId,
        UUID invitedUserId,
        String invitedUserName,
        String invitedUserEmail,
        ProjectMemberRole role
) {

    /**
     * 프로젝트와 초대 대상 사용자 정보를 초대 응답 DTO로 변환한다.
     *
     * @param project 프로젝트
     * @param invitee 초대된 사용자
     * @param role 프로젝트 멤버 역할
     * @return 초대 응답 DTO
     */
    public static ProjectInvitationResponse from(Project project, Member invitee, ProjectMemberRole role) {
        return new ProjectInvitationResponse(
                project.getProjectId(),
                invitee.getUserId(),
                invitee.getName(),
                invitee.getEmail(),
                role
        );
    }
}
