package com.a204.batang.domain.project.service;

import com.a204.batang.domain.auth.entity.Member;
import com.a204.batang.domain.auth.entity.UserType;
import com.a204.batang.domain.auth.repository.MemberRepository;
import com.a204.batang.domain.project.dto.ProjectDetailResponse;
import com.a204.batang.domain.project.repository.ProjectMemberRepository;
import com.a204.batang.domain.project.repository.ProjectRepository;
import com.a204.batang.domain.workspace.entity.PhaseStatus;
import com.a204.batang.domain.workspace.entity.ProjectWorkspace;
import com.a204.batang.domain.workspace.repository.ProjectWorkspaceRepository;
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
import static org.mockito.BDDMockito.given;

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
