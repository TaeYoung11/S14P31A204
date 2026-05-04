package com.a204.batang.domain.project.service;

import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.repository.ProjectMemberRepository;
import com.a204.batang.domain.project.repository.ProjectRepository;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.BDDMockito.given;

@ExtendWith(MockitoExtension.class)
class ProjectAccessServiceTest {

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private ProjectMemberRepository projectMemberRepository;

    @InjectMocks
    private ProjectAccessService projectAccessService;

    @Test
    void validateProjectPinWriterOrThrow_doesNotThrow_whenCurrentUserIsProjectOwner() {
        UUID ownerUserId = UUID.randomUUID();
        Project project = Project.create("test-project", "desc", ownerUserId);

        assertThatCode(() -> projectAccessService.validateProjectPinWriterOrThrow(project, ownerUserId))
                .doesNotThrowAnyException();
    }

    @Test
    void validateProjectPinWriterOrThrow_throwsUnauthorized_whenCurrentUserIsNull() {
        Project project = Project.create("test-project", "desc", UUID.randomUUID());

        assertThatThrownBy(() -> projectAccessService.validateProjectPinWriterOrThrow(project, null))
                .isInstanceOf(CustomException.class)
                .satisfies(exception -> assertThat(((CustomException) exception).getErrorCode())
                        .isEqualTo(ErrorCode.UNAUTHORIZED));
    }

    @Test
    void validateProjectPinWriterOrThrow_throwsForbidden_whenCurrentUserIsNotProjectMember() {
        UUID ownerUserId = UUID.randomUUID();
        UUID otherUserId = UUID.randomUUID();
        Project project = Project.create("test-project", "desc", ownerUserId);

        assertThatThrownBy(() -> projectAccessService.validateProjectPinWriterOrThrow(project, otherUserId))
                .isInstanceOf(CustomException.class)
                .satisfies(exception -> assertThat(((CustomException) exception).getErrorCode())
                        .isEqualTo(ErrorCode.FORBIDDEN_ACCESS));
    }

    @Test
    void validateProjectPinWriterOrThrow_doesNotThrow_whenCurrentUserIsInvitedMember() throws Exception {
        UUID ownerUserId = UUID.randomUUID();
        UUID invitedUserId = UUID.randomUUID();
        UUID projectId = UUID.randomUUID();

        Project project = Project.create("test-project", "desc", ownerUserId);
        var projectIdField = Project.class.getDeclaredField("projectId");
        projectIdField.setAccessible(true);
        projectIdField.set(project, projectId);

        given(projectMemberRepository.existsByProjectProjectIdAndUserId(projectId, invitedUserId)).willReturn(true);

        assertThatCode(() -> projectAccessService.validateProjectPinWriterOrThrow(project, invitedUserId))
                .doesNotThrowAnyException();
    }

    @Test
    void validateProjectPinWriterOrThrow_throwsForbidden_whenProjectHasNoOwner() {
        UUID currentUserId = UUID.randomUUID();
        Project project = Project.create("anonymous-project", "desc");

        assertThatThrownBy(() -> projectAccessService.validateProjectPinWriterOrThrow(project, currentUserId))
                .isInstanceOf(CustomException.class)
                .satisfies(exception -> assertThat(((CustomException) exception).getErrorCode())
                        .isEqualTo(ErrorCode.FORBIDDEN_ACCESS));
    }
}
