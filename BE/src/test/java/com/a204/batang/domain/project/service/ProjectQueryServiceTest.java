package com.a204.batang.domain.project.service;

import com.a204.batang.domain.auth.entity.Member;
import com.a204.batang.domain.auth.entity.UserType;
import com.a204.batang.domain.auth.repository.MemberRepository;
import com.a204.batang.domain.project.dto.ProjectDetailResponse;
import com.a204.batang.domain.project.dto.ProjectParticipantResponse;
import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.repository.ProjectMemberRepository;
import com.a204.batang.domain.project.repository.ProjectRepository;
import com.a204.batang.domain.workspace.entity.PhaseStatus;
import com.a204.batang.domain.workspace.entity.ProjectWorkspace;
import com.a204.batang.domain.workspace.repository.ProjectWorkspaceRepository;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.willThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

@ExtendWith(MockitoExtension.class)
class ProjectQueryServiceTest {

    @Mock
    private MemberRepository memberRepository;

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private ProjectMemberRepository projectMemberRepository;

    @Mock
    private ProjectWorkspaceRepository projectWorkspaceRepository;

    @Mock
    private ProjectAccessService projectAccessService;

    private ProjectQueryService projectQueryService;

    @BeforeEach
    void setUp() {
        projectQueryService = new ProjectQueryService(
                memberRepository,
                projectRepository,
                projectMemberRepository,
                projectWorkspaceRepository,
                projectAccessService
        );
    }

    @Test
    void getMyProjectDetail_returnsBubbleSnapshotWithCreatorAndInvitedUsers() throws Exception {
        UUID currentUserId = UUID.randomUUID();
        UUID projectId = UUID.randomUUID();
        UUID ownerUserId = UUID.randomUUID();
        UUID invitedUserId = UUID.randomUUID();

        var project = com.a204.batang.domain.project.entity.Project.create("bubble-project", "desc", ownerUserId);
        ReflectionTestUtils.setField(project, "projectId", projectId);
        ReflectionTestUtils.setField(project, "cadastralPnu", "1111010100100010000");
        ReflectionTestUtils.setField(project, "cadastralAddress", "서울시 강남구 테스트동 1-1");
        ReflectionTestUtils.setField(
                project,
                "cadastralGeometry",
                List.of(List.of(List.of(List.of(127.0, 37.5), List.of(127.1, 37.5), List.of(127.1, 37.6), List.of(127.0, 37.5))))
        );

        ProjectWorkspace workspace = ProjectWorkspace.create(project);
        ReflectionTestUtils.setField(workspace, "projectId", projectId);
        ReflectionTestUtils.setField(
                workspace,
                "bubbleSnapshotJson",
                new ObjectMapper().readTree("""
                        {
                          "bubbles": [{"id": "bubble-1"}],
                          "connections": []
                        }
                        """)
        );

        Member owner = createMember(ownerUserId, "생성자");
        Member invited = createMember(invitedUserId, "초대사용자");

        given(projectAccessService.resolveCurrentUserIdOrThrow()).willReturn(currentUserId);
        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId)).willReturn(Optional.of(workspace));
        given(memberRepository.findById(ownerUserId)).willReturn(Optional.of(owner));
        given(projectMemberRepository.findUserIdsByProjectId(projectId)).willReturn(List.of(invitedUserId));
        given(memberRepository.findAllById(List.of(invitedUserId))).willReturn(List.of(invited));

        ProjectDetailResponse response = projectQueryService.getMyProjectDetail(projectId);

        assertThat(response.projectId()).isEqualTo(projectId);
        assertThat(response.bubbleEditing()).isTrue();
        assertThat(response.phaseStatus()).isEqualTo(PhaseStatus.BUBBLE_DRAFT);
        assertThat(response.bubbleSnapshotJson()).isNotNull();
        assertThat(response.ifcStorageUrl()).isNull();
        assertThat(response.siteInfo()).isNotNull();
        assertThat(response.siteInfo().address()).isEqualTo("서울시 강남구 테스트동 1-1");

        assertThat(response.creator()).isNotNull();
        assertThat(response.creator().userId()).isEqualTo(ownerUserId);
        assertThat(response.creator().name()).isEqualTo("생성자");
        assertThat(response.invitedUsers()).hasSize(1);
        assertThat(response.invitedUsers().get(0).userId()).isEqualTo(invitedUserId);
        assertThat(response.invitedUsers().get(0).name()).isEqualTo("초대사용자");
    }

    @Test
    void getMyProjectDetail_returnsIfcUrlWhenBubbleEditingFinished() throws Exception {
        UUID currentUserId = UUID.randomUUID();
        UUID projectId = UUID.randomUUID();
        UUID ownerUserId = UUID.randomUUID();
        UUID invitedUserId = UUID.randomUUID();

        var project = com.a204.batang.domain.project.entity.Project.create("ifc-project", "desc", ownerUserId);
        ReflectionTestUtils.setField(project, "projectId", projectId);
        ReflectionTestUtils.setField(project, "cadastralAddress", "부산시 해운대구 테스트동 2-2");

        ProjectWorkspace workspace = ProjectWorkspace.create(project);
        ReflectionTestUtils.setField(workspace, "projectId", projectId);
        ReflectionTestUtils.setField(workspace, "phaseStatus", PhaseStatus.IFC_EDIT);
        ReflectionTestUtils.setField(
                workspace,
                "bubbleSnapshotJson",
                new ObjectMapper().readTree("""
                        {
                          "bubbles": [{"id": "bubble-2"}],
                          "connections": []
                        }
                        """)
        );
        ReflectionTestUtils.setField(workspace, "ifcStorageUrl", "s3://bucket/projects/%s/revisions/%s/ifc/model.v1.ifc".formatted(projectId, UUID.randomUUID()));
        ReflectionTestUtils.setField(workspace, "currentRevision", UUID.randomUUID().toString());

        Member owner = createMember(ownerUserId, "생성자");
        Member invited = createMember(invitedUserId, "초대사용자");

        given(projectAccessService.resolveCurrentUserIdOrThrow()).willReturn(currentUserId);
        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId)).willReturn(Optional.of(workspace));
        given(memberRepository.findById(ownerUserId)).willReturn(Optional.of(owner));
        given(projectMemberRepository.findUserIdsByProjectId(projectId)).willReturn(List.of(invitedUserId));
        given(memberRepository.findAllById(List.of(invitedUserId))).willReturn(List.of(invited));

        ProjectDetailResponse response = projectQueryService.getMyProjectDetail(projectId);

        assertThat(response.projectId()).isEqualTo(projectId);
        assertThat(response.bubbleEditing()).isFalse();
        assertThat(response.phaseStatus()).isEqualTo(PhaseStatus.IFC_EDIT);
        assertThat(response.bubbleSnapshotJson()).isNotNull();
        assertThat(response.bubbleSnapshotJson().get("bubbles").get(0).get("id").asText()).isEqualTo("bubble-2");
        assertThat(response.ifcStorageUrl()).isEqualTo(workspace.getIfcStorageUrl());
        assertThat(response.siteInfo()).isNotNull();
        assertThat(response.siteInfo().address()).isEqualTo("부산시 해운대구 테스트동 2-2");

        assertThat(response.creator()).isNotNull();
        assertThat(response.creator().userId()).isEqualTo(ownerUserId);
        assertThat(response.creator().name()).isEqualTo("생성자");
        assertThat(response.invitedUsers()).hasSize(1);
        assertThat(response.invitedUsers().get(0).userId()).isEqualTo(invitedUserId);
        assertThat(response.invitedUsers().get(0).name()).isEqualTo("초대사용자");
    }

    @Test
    void getMyProjectDetail_excludesOwnerFromInvitedUsers_whenProjectMembersContainOwner() {
        UUID currentUserId = UUID.randomUUID();
        UUID projectId = UUID.randomUUID();
        UUID ownerUserId = UUID.randomUUID();
        UUID invitedUserId = UUID.randomUUID();

        var project = com.a204.batang.domain.project.entity.Project.create("member-project", "desc", ownerUserId);
        ReflectionTestUtils.setField(project, "projectId", projectId);
        ProjectWorkspace workspace = ProjectWorkspace.create(project);
        ReflectionTestUtils.setField(workspace, "projectId", projectId);

        Member owner = createMember(ownerUserId, "owner");
        Member invited = createMember(invitedUserId, "invited");

        given(projectAccessService.resolveCurrentUserIdOrThrow()).willReturn(currentUserId);
        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId)).willReturn(Optional.of(workspace));
        given(memberRepository.findById(ownerUserId)).willReturn(Optional.of(owner));
        given(projectMemberRepository.findUserIdsByProjectId(projectId)).willReturn(List.of(ownerUserId, invitedUserId));
        given(memberRepository.findAllById(List.of(invitedUserId))).willReturn(List.of(invited));

        ProjectDetailResponse response = projectQueryService.getMyProjectDetail(projectId);

        assertThat(response.creator()).isNotNull();
        assertThat(response.creator().userId()).isEqualTo(ownerUserId);
        assertThat(response.invitedUsers()).hasSize(1);
        assertThat(response.invitedUsers().get(0).userId()).isEqualTo(invitedUserId);
        assertThat(response.invitedUsers())
                .extracting(ProjectParticipantResponse::userId)
                .doesNotContain(ownerUserId);
    }

    @Test
    void getMyProjectDetail_returnsEmptyInvitedUsers_whenProjectHasNoInvitedMembers() {
        UUID currentUserId = UUID.randomUUID();
        UUID projectId = UUID.randomUUID();
        UUID ownerUserId = UUID.randomUUID();

        var project = com.a204.batang.domain.project.entity.Project.create("empty-member-project", "desc", ownerUserId);
        ReflectionTestUtils.setField(project, "projectId", projectId);
        ProjectWorkspace workspace = ProjectWorkspace.create(project);
        ReflectionTestUtils.setField(workspace, "projectId", projectId);

        Member owner = createMember(ownerUserId, "owner");

        given(projectAccessService.resolveCurrentUserIdOrThrow()).willReturn(currentUserId);
        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId)).willReturn(Optional.of(workspace));
        given(memberRepository.findById(ownerUserId)).willReturn(Optional.of(owner));
        given(projectMemberRepository.findUserIdsByProjectId(projectId)).willReturn(List.of());

        ProjectDetailResponse response = projectQueryService.getMyProjectDetail(projectId);

        assertThat(response.creator()).isNotNull();
        assertThat(response.creator().userId()).isEqualTo(ownerUserId);
        assertThat(response.invitedUsers()).isEmpty();
    }

    @Test
    void getMyProjectDetail_throwsProjectNotFound_whenProjectIsDeletedOrMissing() {
        UUID currentUserId = UUID.randomUUID();
        UUID projectId = UUID.randomUUID();

        given(projectAccessService.resolveCurrentUserIdOrThrow()).willReturn(currentUserId);
        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.empty());

        assertThatThrownBy(() -> projectQueryService.getMyProjectDetail(projectId))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.PROJECT_NOT_FOUND);

        verify(projectAccessService, never()).validateProjectPinWriterOrThrow(any(Project.class), any(UUID.class));
        verifyNoInteractions(projectWorkspaceRepository);
        verify(projectMemberRepository, never()).findUserIdsByProjectId(projectId);
    }

    @Test
    void getMyProjectDetail_throwsForbidden_whenCurrentUserIsNotOwnerOrProjectMember() {
        UUID currentUserId = UUID.randomUUID();
        UUID projectId = UUID.randomUUID();
        UUID ownerUserId = UUID.randomUUID();

        var project = com.a204.batang.domain.project.entity.Project.create("forbidden-project", "desc", ownerUserId);
        ReflectionTestUtils.setField(project, "projectId", projectId);

        given(projectAccessService.resolveCurrentUserIdOrThrow()).willReturn(currentUserId);
        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        willThrow(new CustomException(ErrorCode.FORBIDDEN_ACCESS))
                .given(projectAccessService)
                .validateProjectPinWriterOrThrow(project, currentUserId);

        assertThatThrownBy(() -> projectQueryService.getMyProjectDetail(projectId))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.FORBIDDEN_ACCESS);

        verifyNoInteractions(projectWorkspaceRepository);
        verify(projectMemberRepository, never()).findUserIdsByProjectId(projectId);
    }

    private Member createMember(UUID userId, String name) {
        Member member = Member.create(
                userId + "@example.com",
                "hashed-password",
                name,
                UserType.DESIGNER
        );
        ReflectionTestUtils.setField(member, "userId", userId);
        return member;
    }
}
