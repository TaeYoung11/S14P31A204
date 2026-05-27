package com.a204.batang.domain.project.service;

import com.a204.batang.domain.project.dto.ProjectMemberRemovalResponse;
import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.entity.ProjectMember;
import com.a204.batang.domain.project.entity.ProjectMemberRole;
import com.a204.batang.domain.project.repository.ProjectMemberRepository;
import com.a204.batang.domain.project.repository.ProjectRepository;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Objects;
import java.util.UUID;

/**
 * 프로젝트 멤버 제거를 처리하는 서비스다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ProjectMemberService {

    private static final ProjectMemberRole REMOVABLE_MEMBER_ROLE = ProjectMemberRole.CLIENT;

    private final ProjectRepository projectRepository;
    private final ProjectMemberRepository projectMemberRepository;
    private final ProjectAccessService projectAccessService;

    /**
     * 프로젝트 owner가 CLIENT 멤버를 제거한다.
     *
     * @param projectId 프로젝트 ID
     * @param userId 제거할 사용자 ID
     * @return 제거 결과
     */
    @Transactional
    public ProjectMemberRemovalResponse removeProjectMember(UUID projectId, UUID userId) {
        UUID currentUserId = projectAccessService.resolveCurrentUserIdOrThrow();

        Project project = projectRepository.findByProjectIdAndDeletedAtIsNullForUpdate(projectId)
                .orElseThrow(() -> new CustomException(ErrorCode.PROJECT_NOT_FOUND));
        projectAccessService.validateProjectOwnerOrThrow(project, currentUserId);
        validateOwnerRemovalNotAllowed(project, userId);

        ProjectMember projectMember = projectMemberRepository.findByProjectProjectIdAndUserIdAndMemberRole(
                        projectId,
                        userId,
                        REMOVABLE_MEMBER_ROLE
                )
                .orElseThrow(() -> new CustomException(ErrorCode.PROJECT_MEMBER_NOT_FOUND));

        projectMemberRepository.delete(projectMember);
        LocalDateTime removedAt = LocalDateTime.now();

        log.info("프로젝트 멤버 제거 완료. projectId={}, removedUserId={}", projectId, userId);
        return ProjectMemberRemovalResponse.of(projectId, userId, removedAt);
    }

    /**
     * 프로젝트 owner 제거 시도를 차단한다.
     *
     * @param project 프로젝트
     * @param userId 제거 대상 사용자 ID
     */
    private void validateOwnerRemovalNotAllowed(Project project, UUID userId) {
        if (Objects.equals(project.getOwnerUserId(), userId)) {
            throw new CustomException(ErrorCode.OWNER_REMOVAL_NOT_ALLOWED);
        }
    }
}
