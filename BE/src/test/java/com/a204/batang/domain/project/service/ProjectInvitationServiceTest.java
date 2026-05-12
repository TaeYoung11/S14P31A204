package com.a204.batang.domain.project.service;

import com.a204.batang.domain.auth.entity.Member;
import com.a204.batang.domain.auth.entity.UserStatus;
import com.a204.batang.domain.auth.entity.UserType;
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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.willThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

@ExtendWith(MockitoExtension.class)
class ProjectInvitationServiceTest {

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private ProjectMemberRepository projectMemberRepository;

    @Mock
    private MemberRepository memberRepository;

    @Mock
    private ProjectInvitationNotificationRepository projectInvitationNotificationRepository;

    @Mock
    private ProjectAccessService projectAccessService;

    @InjectMocks
    private ProjectInvitationService projectInvitationService;

    private UUID projectId;
    private UUID ownerUserId;
    private UUID inviteeUserId;

    private Project project;
    private Member owner;
    private Member invitee;

    @BeforeEach
    void setUp() {
        projectId = UUID.randomUUID();
        ownerUserId = UUID.randomUUID();
        inviteeUserId = UUID.randomUUID();

        project = Project.create("test-project", "desc", ownerUserId);
        ReflectionTestUtils.setField(project, "projectId", projectId);

        owner = createMember(ownerUserId, "owner@example.com", UserStatus.ACTIVE);
        invitee = createMember(inviteeUserId, "client@example.com", UserStatus.ACTIVE);
    }

    @Test
    void inviteProjectMember_savesClientMember_whenOwnerInvitesActiveUser() {
        ProjectInvitationRequest request = new ProjectInvitationRequest("  CLIENT@example.com  ");

        given(projectAccessService.resolveCurrentUserIdOrThrow()).willReturn(ownerUserId);
        given(projectRepository.findByProjectIdAndDeletedAtIsNullForUpdate(projectId)).willReturn(Optional.of(project));
        given(memberRepository.findByEmailIgnoreCase("CLIENT@example.com")).willReturn(Optional.of(invitee));
        given(projectMemberRepository.existsByProjectProjectIdAndUserIdAndMemberRole(
                projectId,
                inviteeUserId,
                ProjectMemberRole.CLIENT
        )).willReturn(false);
        given(memberRepository.findById(ownerUserId)).willReturn(Optional.of(owner));

        ProjectInvitationResponse response = projectInvitationService.inviteProjectMember(projectId, request);

        assertThat(response.projectId()).isEqualTo(projectId);
        assertThat(response.invitedUserId()).isEqualTo(inviteeUserId);
        assertThat(response.invitedUserName()).isEqualTo(invitee.getName());
        assertThat(response.invitedUserEmail()).isEqualTo(invitee.getEmail());
        assertThat(response.role()).isEqualTo(ProjectMemberRole.CLIENT);

        ArgumentCaptor<ProjectMember> captor = ArgumentCaptor.forClass(ProjectMember.class);
        verify(projectMemberRepository).saveAndFlush(captor.capture());
        ProjectMember savedProjectMember = captor.getValue();
        assertThat(savedProjectMember.getProject()).isSameAs(project);
        assertThat(savedProjectMember.getUserId()).isEqualTo(inviteeUserId);
        assertThat(savedProjectMember.getMemberRole()).isEqualTo(ProjectMemberRole.CLIENT);

        ArgumentCaptor<ProjectInvitationNotification> notificationCaptor =
                ArgumentCaptor.forClass(ProjectInvitationNotification.class);
        verify(projectInvitationNotificationRepository).save(notificationCaptor.capture());
        ProjectInvitationNotification savedNotification = notificationCaptor.getValue();
        assertThat(savedNotification.getRecipientUserId()).isEqualTo(inviteeUserId);
        assertThat(savedNotification.getInviterUserId()).isEqualTo(ownerUserId);
        assertThat(savedNotification.getProjectId()).isEqualTo(projectId);
        assertThat(savedNotification.getProjectName()).isEqualTo(project.getName());
        assertThat(savedNotification.getInviterName()).isEqualTo(owner.getName());
        assertThat(savedNotification.isRead()).isFalse();
        assertThat(savedNotification.getReadAt()).isNull();
    }

    @Test
    void inviteProjectMember_throwsProjectNotFound_whenProjectDoesNotExist() {
        ProjectInvitationRequest request = new ProjectInvitationRequest("client@example.com");

        given(projectAccessService.resolveCurrentUserIdOrThrow()).willReturn(ownerUserId);
        given(projectRepository.findByProjectIdAndDeletedAtIsNullForUpdate(projectId)).willReturn(Optional.empty());

        assertThatThrownBy(() -> projectInvitationService.inviteProjectMember(projectId, request))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.PROJECT_NOT_FOUND);

        verifyNoInteractions(memberRepository);
        verify(projectMemberRepository, never()).saveAndFlush(any(ProjectMember.class));
        verify(projectInvitationNotificationRepository, never()).save(any(ProjectInvitationNotification.class));
    }

    @Test
    void inviteProjectMember_throwsInvalidRequest_whenInviteeEmailFormatIsInvalidAfterTrim() {
        ProjectInvitationRequest request = new ProjectInvitationRequest("  not-email  ");

        given(projectAccessService.resolveCurrentUserIdOrThrow()).willReturn(ownerUserId);

        assertThatThrownBy(() -> projectInvitationService.inviteProjectMember(projectId, request))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_REQUEST);

        verifyNoInteractions(projectRepository);
        verifyNoInteractions(memberRepository);
        verify(projectMemberRepository, never()).saveAndFlush(any(ProjectMember.class));
        verify(projectInvitationNotificationRepository, never()).save(any(ProjectInvitationNotification.class));
    }

    @Test
    void inviteProjectMember_throwsForbidden_whenCurrentUserIsNotProjectOwner() {
        UUID otherUserId = UUID.randomUUID();
        ProjectInvitationRequest request = new ProjectInvitationRequest("client@example.com");

        given(projectAccessService.resolveCurrentUserIdOrThrow()).willReturn(otherUserId);
        given(projectRepository.findByProjectIdAndDeletedAtIsNullForUpdate(projectId)).willReturn(Optional.of(project));
        willThrow(new CustomException(ErrorCode.FORBIDDEN_ACCESS))
                .given(projectAccessService)
                .validateProjectOwnerOrThrow(project, otherUserId);

        assertThatThrownBy(() -> projectInvitationService.inviteProjectMember(projectId, request))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.FORBIDDEN_ACCESS);

        verifyNoInteractions(memberRepository);
        verify(projectMemberRepository, never()).saveAndFlush(any(ProjectMember.class));
        verify(projectInvitationNotificationRepository, never()).save(any(ProjectInvitationNotification.class));
    }

    @Test
    void inviteProjectMember_throwsInviteeNotFound_whenEmailDoesNotMatchAnyUser() {
        ProjectInvitationRequest request = new ProjectInvitationRequest("missing@example.com");

        given(projectAccessService.resolveCurrentUserIdOrThrow()).willReturn(ownerUserId);
        given(projectRepository.findByProjectIdAndDeletedAtIsNullForUpdate(projectId)).willReturn(Optional.of(project));
        given(memberRepository.findByEmailIgnoreCase("missing@example.com")).willReturn(Optional.empty());

        assertThatThrownBy(() -> projectInvitationService.inviteProjectMember(projectId, request))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVITEE_NOT_FOUND);

        verify(projectMemberRepository, never()).saveAndFlush(any(ProjectMember.class));
        verify(projectInvitationNotificationRepository, never()).save(any(ProjectInvitationNotification.class));
    }

    @Test
    void inviteProjectMember_throwsUserNotActive_whenInviteeIsWithdrawn() {
        Member withdrawnInvitee = createMember(inviteeUserId, "client@example.com", UserStatus.WITHDRAWN);
        ProjectInvitationRequest request = new ProjectInvitationRequest("client@example.com");

        given(projectAccessService.resolveCurrentUserIdOrThrow()).willReturn(ownerUserId);
        given(projectRepository.findByProjectIdAndDeletedAtIsNullForUpdate(projectId)).willReturn(Optional.of(project));
        given(memberRepository.findByEmailIgnoreCase("client@example.com")).willReturn(Optional.of(withdrawnInvitee));

        assertThatThrownBy(() -> projectInvitationService.inviteProjectMember(projectId, request))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.USER_NOT_ACTIVE);

        verify(projectMemberRepository, never()).saveAndFlush(any(ProjectMember.class));
        verify(projectInvitationNotificationRepository, never()).save(any(ProjectInvitationNotification.class));
    }

    @Test
    void inviteProjectMember_throwsSelfInvitationNotAllowed_whenOwnerInvitesSelf() {
        Member owner = createMember(ownerUserId, "owner@example.com", UserStatus.ACTIVE);
        ProjectInvitationRequest request = new ProjectInvitationRequest("owner@example.com");

        given(projectAccessService.resolveCurrentUserIdOrThrow()).willReturn(ownerUserId);
        given(projectRepository.findByProjectIdAndDeletedAtIsNullForUpdate(projectId)).willReturn(Optional.of(project));
        given(memberRepository.findByEmailIgnoreCase("owner@example.com")).willReturn(Optional.of(owner));

        assertThatThrownBy(() -> projectInvitationService.inviteProjectMember(projectId, request))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.SELF_INVITATION_NOT_ALLOWED);

        verify(projectMemberRepository, never()).saveAndFlush(any(ProjectMember.class));
        verify(projectInvitationNotificationRepository, never()).save(any(ProjectInvitationNotification.class));
    }

    @Test
    void inviteProjectMember_throwsProjectMemberAlreadyExists_whenInviteeIsAlreadyClient() {
        ProjectInvitationRequest request = new ProjectInvitationRequest("client@example.com");

        given(projectAccessService.resolveCurrentUserIdOrThrow()).willReturn(ownerUserId);
        given(projectRepository.findByProjectIdAndDeletedAtIsNullForUpdate(projectId)).willReturn(Optional.of(project));
        given(memberRepository.findByEmailIgnoreCase("client@example.com")).willReturn(Optional.of(invitee));
        given(projectMemberRepository.existsByProjectProjectIdAndUserIdAndMemberRole(
                projectId,
                inviteeUserId,
                ProjectMemberRole.CLIENT
        )).willReturn(true);

        assertThatThrownBy(() -> projectInvitationService.inviteProjectMember(projectId, request))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.PROJECT_MEMBER_ALREADY_EXISTS);

        verify(projectMemberRepository, never()).saveAndFlush(any(ProjectMember.class));
        verify(projectInvitationNotificationRepository, never()).save(any(ProjectInvitationNotification.class));
    }

    @Test
    void inviteProjectMember_convertsUniqueConstraintViolationToProjectMemberAlreadyExists() {
        ProjectInvitationRequest request = new ProjectInvitationRequest("client@example.com");

        given(projectAccessService.resolveCurrentUserIdOrThrow()).willReturn(ownerUserId);
        given(projectRepository.findByProjectIdAndDeletedAtIsNullForUpdate(projectId)).willReturn(Optional.of(project));
        given(memberRepository.findByEmailIgnoreCase("client@example.com")).willReturn(Optional.of(invitee));
        given(projectMemberRepository.existsByProjectProjectIdAndUserIdAndMemberRole(
                projectId,
                inviteeUserId,
                ProjectMemberRole.CLIENT
        )).willReturn(false);
        given(memberRepository.findById(ownerUserId)).willReturn(Optional.of(owner));
        given(projectMemberRepository.saveAndFlush(any(ProjectMember.class)))
                .willThrow(new DataIntegrityViolationException("duplicate"));

        assertThatThrownBy(() -> projectInvitationService.inviteProjectMember(projectId, request))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.PROJECT_MEMBER_ALREADY_EXISTS);

        verify(projectInvitationNotificationRepository, never()).save(any(ProjectInvitationNotification.class));
    }

    private Member createMember(UUID userId, String email, UserStatus status) {
        Member member = Member.create(
                email,
                "encoded-password",
                "테스트 사용자",
                UserType.CUSTOMER
        );
        ReflectionTestUtils.setField(member, "userId", userId);
        ReflectionTestUtils.setField(member, "status", status);
        return member;
    }
}
