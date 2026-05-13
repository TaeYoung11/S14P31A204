package com.a204.batang.domain.project.service;

import com.a204.batang.domain.auth.entity.Member;
import com.a204.batang.domain.auth.entity.UserStatus;
import com.a204.batang.domain.auth.repository.MemberRepository;
import com.a204.batang.domain.notification.entity.ProjectInvitationNotification;
import com.a204.batang.domain.notification.repository.ProjectInvitationNotificationRepository;
import com.a204.batang.domain.project.dto.ProjectInvitationRequest;
import com.a204.batang.domain.project.dto.ProjectInvitationResponse;
import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.entity.ProjectMember;
import com.a204.batang.domain.project.entity.ProjectMemberRole;
import com.a204.batang.domain.project.repository.ProjectMemberRepository;
import com.a204.batang.domain.project.repository.ProjectRepository;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.Objects;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * 프로젝트 멤버 초대를 처리하는 서비스다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ProjectInvitationService {

    private static final ProjectMemberRole INVITED_MEMBER_ROLE = ProjectMemberRole.CLIENT;
    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$");

    private final ProjectRepository projectRepository;
    private final ProjectMemberRepository projectMemberRepository;
    private final MemberRepository memberRepository;
    private final ProjectInvitationNotificationRepository projectInvitationNotificationRepository;
    private final ProjectAccessService projectAccessService;

    /**
     * 프로젝트 owner가 가입된 사용자를 프로젝트 CLIENT 멤버로 즉시 등록한다.
     *
     * @param projectId 프로젝트 ID
     * @param request 초대 요청
     * @return 초대 결과
     */
    @Transactional
    public ProjectInvitationResponse inviteProjectMember(UUID projectId, ProjectInvitationRequest request) {
        UUID currentUserId = projectAccessService.resolveCurrentUserIdOrThrow();
        String inviteeEmail = normalizeInviteeEmailOrThrow(request.inviteeEmail());

        Project project = projectRepository.findByProjectIdAndDeletedAtIsNullForUpdate(projectId)
                .orElseThrow(() -> new CustomException(ErrorCode.PROJECT_NOT_FOUND));
        projectAccessService.validateProjectOwnerOrThrow(project, currentUserId);

        Member invitee = memberRepository.findByEmailIgnoreCase(inviteeEmail)
                .orElseThrow(() -> new CustomException(ErrorCode.INVITEE_NOT_FOUND));

        validateInviteeOrThrow(project, currentUserId, invitee);
        Member inviter = findInviterOrThrow(currentUserId);
        saveProjectMember(project, invitee);
        saveProjectInvitationNotification(project, inviter, invitee);

        log.info("프로젝트 멤버 초대 완료. projectId={}, inviteeUserId={}", project.getProjectId(), invitee.getUserId());
        return ProjectInvitationResponse.from(project, invitee, INVITED_MEMBER_ROLE);
    }

    /**
     * 초대 이메일을 앞뒤 공백만 제거하고 필수 여부를 검증한다.
     *
     * @param inviteeEmail 원본 이메일
     * @return 정규화된 이메일
     */
    private String normalizeInviteeEmailOrThrow(String inviteeEmail) {
        if (!StringUtils.hasText(inviteeEmail)) {
            throw new CustomException(ErrorCode.INVALID_REQUEST, "inviteeEmail은 필수입니다.");
        }
        String normalizedEmail = inviteeEmail.trim();
        if (!EMAIL_PATTERN.matcher(normalizedEmail).matches()) {
            throw new CustomException(ErrorCode.INVALID_REQUEST, "inviteeEmail은 올바른 이메일 형식이어야 합니다.");
        }
        return normalizedEmail;
    }

    /**
     * 초대한 사용자 정보를 조회한다.
     *
     * @param inviterUserId 초대한 사용자 ID
     * @return 초대한 사용자
     */
    private Member findInviterOrThrow(UUID inviterUserId) {
        return memberRepository.findById(inviterUserId)
                .orElseThrow(() -> new CustomException(ErrorCode.UNAUTHORIZED, "로그인 사용자 정보를 찾을 수 없습니다."));
    }

    /**
     * 초대 대상 사용자가 프로젝트에 등록 가능한지 검증한다.
     *
     * @param project 프로젝트
     * @param currentUserId 현재 사용자 ID
     * @param invitee 초대 대상 사용자
     */
    private void validateInviteeOrThrow(Project project, UUID currentUserId, Member invitee) {
        if (invitee.getStatus() != UserStatus.ACTIVE) {
            throw new CustomException(ErrorCode.USER_NOT_ACTIVE);
        }

        UUID inviteeUserId = invitee.getUserId();
        if (Objects.equals(currentUserId, inviteeUserId)) {
            throw new CustomException(ErrorCode.SELF_INVITATION_NOT_ALLOWED);
        }

        if (Objects.equals(project.getOwnerUserId(), inviteeUserId)) {
            throw new CustomException(ErrorCode.PROJECT_MEMBER_ALREADY_EXISTS);
        }

        boolean alreadyClient = projectMemberRepository.existsByProjectProjectIdAndUserIdAndMemberRole(
                project.getProjectId(),
                inviteeUserId,
                INVITED_MEMBER_ROLE
        );
        if (alreadyClient) {
            throw new CustomException(ErrorCode.PROJECT_MEMBER_ALREADY_EXISTS);
        }
    }

    /**
     * 초대 대상 사용자를 프로젝트 CLIENT 멤버로 저장한다.
     *
     * @param project 프로젝트
     * @param invitee 초대 대상 사용자
     */
    private void saveProjectMember(Project project, Member invitee) {
        try {
            ProjectMember projectMember = ProjectMember.create(project, invitee.getUserId(), INVITED_MEMBER_ROLE);
            projectMemberRepository.saveAndFlush(projectMember);
        } catch (DataIntegrityViolationException e) {
            throw new CustomException(ErrorCode.PROJECT_MEMBER_ALREADY_EXISTS);
        }
    }

    /**
     * 초대 대상 사용자에게 프로젝트 초대 알림을 저장한다.
     *
     * @param project 프로젝트
     * @param inviter 초대한 사용자
     * @param invitee 초대 대상 사용자
     */
    private void saveProjectInvitationNotification(Project project, Member inviter, Member invitee) {
        ProjectInvitationNotification notification = ProjectInvitationNotification.create(
                invitee.getUserId(),
                inviter.getUserId(),
                project.getProjectId(),
                project.getName(),
                inviter.getName()
        );
        projectInvitationNotificationRepository.save(notification);
    }
}
