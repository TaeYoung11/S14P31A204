package com.a204.batang.domain.project.service;

import com.a204.batang.domain.project.dto.ProjectMemberRemovalResponse;
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
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
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
class ProjectMemberServiceTest {

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private ProjectMemberRepository projectMemberRepository;

    @Mock
    private ProjectAccessService projectAccessService;

    @InjectMocks
    private ProjectMemberService projectMemberService;

    private UUID projectId;
    private UUID ownerUserId;
    private UUID memberUserId;
    private Project project;
    private ProjectMember projectMember;

    @BeforeEach
    void setUp() {
        projectId = UUID.randomUUID();
        ownerUserId = UUID.randomUUID();
        memberUserId = UUID.randomUUID();

        project = Project.create("test-project", "desc", ownerUserId);
        ReflectionTestUtils.setField(project, "projectId", projectId);

        projectMember = ProjectMember.create(project, memberUserId, ProjectMemberRole.CLIENT);
    }

    @Test
    void removeProjectMember_deletesClientMemberAndReturnsResponse_whenCurrentUserIsOwner() {
        given(projectAccessService.resolveCurrentUserIdOrThrow()).willReturn(ownerUserId);
        given(projectRepository.findByProjectIdAndDeletedAtIsNullForUpdate(projectId)).willReturn(Optional.of(project));
        given(projectMemberRepository.findByProjectProjectIdAndUserIdAndMemberRole(
                projectId,
                memberUserId,
                ProjectMemberRole.CLIENT
        )).willReturn(Optional.of(projectMember));

        ProjectMemberRemovalResponse response = projectMemberService.removeProjectMember(projectId, memberUserId);

        assertThat(response.projectId()).isEqualTo(projectId);
        assertThat(response.removedUserId()).isEqualTo(memberUserId);
        assertThat(response.removedAt()).isNotNull();

        verify(projectAccessService).validateProjectOwnerOrThrow(project, ownerUserId);
        verify(projectMemberRepository).delete(projectMember);
    }

    @Test
    void removeProjectMember_throwsProjectNotFound_whenProjectDoesNotExist() {
        given(projectAccessService.resolveCurrentUserIdOrThrow()).willReturn(ownerUserId);
        given(projectRepository.findByProjectIdAndDeletedAtIsNullForUpdate(projectId)).willReturn(Optional.empty());

        assertThatThrownBy(() -> projectMemberService.removeProjectMember(projectId, memberUserId))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.PROJECT_NOT_FOUND);

        verify(projectAccessService, never()).validateProjectOwnerOrThrow(any(Project.class), any(UUID.class));
        verify(projectMemberRepository, never()).delete(any(ProjectMember.class));
    }

    @Test
    void removeProjectMember_throwsForbidden_whenCurrentUserIsNotProjectOwner() {
        UUID otherUserId = UUID.randomUUID();

        given(projectAccessService.resolveCurrentUserIdOrThrow()).willReturn(otherUserId);
        given(projectRepository.findByProjectIdAndDeletedAtIsNullForUpdate(projectId)).willReturn(Optional.of(project));
        willThrow(new CustomException(ErrorCode.FORBIDDEN_ACCESS))
                .given(projectAccessService)
                .validateProjectOwnerOrThrow(project, otherUserId);

        assertThatThrownBy(() -> projectMemberService.removeProjectMember(projectId, memberUserId))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.FORBIDDEN_ACCESS);

        verifyNoInteractions(projectMemberRepository);
    }

    @Test
    void removeProjectMember_throwsOwnerRemovalNotAllowed_whenTargetUserIsProjectOwner() {
        given(projectAccessService.resolveCurrentUserIdOrThrow()).willReturn(ownerUserId);
        given(projectRepository.findByProjectIdAndDeletedAtIsNullForUpdate(projectId)).willReturn(Optional.of(project));

        assertThatThrownBy(() -> projectMemberService.removeProjectMember(projectId, ownerUserId))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.OWNER_REMOVAL_NOT_ALLOWED);

        verify(projectAccessService).validateProjectOwnerOrThrow(project, ownerUserId);
        verifyNoInteractions(projectMemberRepository);
    }

    @Test
    void removeProjectMember_throwsProjectMemberNotFound_whenTargetClientMemberDoesNotExist() {
        given(projectAccessService.resolveCurrentUserIdOrThrow()).willReturn(ownerUserId);
        given(projectRepository.findByProjectIdAndDeletedAtIsNullForUpdate(projectId)).willReturn(Optional.of(project));
        given(projectMemberRepository.findByProjectProjectIdAndUserIdAndMemberRole(
                projectId,
                memberUserId,
                ProjectMemberRole.CLIENT
        )).willReturn(Optional.empty());

        assertThatThrownBy(() -> projectMemberService.removeProjectMember(projectId, memberUserId))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.PROJECT_MEMBER_NOT_FOUND);

        verify(projectAccessService).validateProjectOwnerOrThrow(project, ownerUserId);
        verify(projectMemberRepository, never()).delete(any(ProjectMember.class));
    }
}
