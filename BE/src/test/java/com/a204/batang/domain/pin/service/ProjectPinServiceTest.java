package com.a204.batang.domain.pin.service;

import com.a204.batang.domain.pin.entity.PinPosition;
import com.a204.batang.domain.pin.entity.ProjectPin;
import com.a204.batang.domain.pin.repository.ProjectPinCommentRepository;
import com.a204.batang.domain.pin.repository.ProjectPinReadStateRepository;
import com.a204.batang.domain.pin.repository.ProjectPinRepository;
import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.repository.ProjectRepository;
import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

@ExtendWith(MockitoExtension.class)
class ProjectPinServiceTest {

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private ProjectPinRepository projectPinRepository;

    @Mock
    private ProjectPinCommentRepository projectPinCommentRepository;

    @Mock
    private ProjectPinReadStateRepository projectPinReadStateRepository;

    @Mock
    private ProjectAccessService projectAccessService;

    @Mock
    private ApplicationEventPublisher applicationEventPublisher;

    @InjectMocks
    private ProjectPinService projectPinService;

    private UUID projectId;
    private UUID pinId;
    private UUID authorUserId;

    private Project project;
    private ProjectPin pin;

    @BeforeEach
    void setUp() {
        projectId = UUID.randomUUID();
        pinId = UUID.randomUUID();
        authorUserId = UUID.randomUUID();

        project = Project.create("test-project", "desc");
        ReflectionTestUtils.setField(project, "projectId", projectId);

        pin = ProjectPin.create(
                project,
                authorUserId,
                PinPosition.of(1.0, 2.0, 3.0),
                PinPosition.of(10.0, 20.0, 30.0),
                "beam-01",
                "pin-content"
        );
        ReflectionTestUtils.setField(pin, "pinId", pinId);
        ReflectionTestUtils.setField(pin, "createdAt", LocalDateTime.of(2026, 4, 28, 9, 0, 0));
    }

    @Test
    void deletePin_softDeletesPinAndComments_whenCurrentUserIsAuthor() {
        given(projectPinRepository.findActivePinByProjectId(pinId, projectId))
                .willReturn(Optional.of(pin));
        given(projectAccessService.resolveCurrentUserId()).willReturn(authorUserId);
        given(projectPinCommentRepository.softDeleteByPinId(any(UUID.class), any(LocalDateTime.class)))
                .willReturn(2);

        projectPinService.deletePin(projectId, pinId);

        assertThat(pin.getDeletedAt()).isNotNull();

        ArgumentCaptor<LocalDateTime> deletedAtCaptor = ArgumentCaptor.forClass(LocalDateTime.class);
        verify(projectPinCommentRepository).softDeleteByPinId(eq(pinId), deletedAtCaptor.capture());
        assertThat(deletedAtCaptor.getValue()).isEqualTo(pin.getDeletedAt());

        verify(projectAccessService).validateProjectPinWriterOrThrow(project, authorUserId);
        verifyNoInteractions(projectPinReadStateRepository);
    }

    @Test
    void deletePin_throwsForbidden_whenCurrentUserIsNotAuthor() {
        UUID otherUserId = UUID.randomUUID();

        given(projectPinRepository.findActivePinByProjectId(pinId, projectId))
                .willReturn(Optional.of(pin));
        given(projectAccessService.resolveCurrentUserId()).willReturn(otherUserId);

        assertThatThrownBy(() -> projectPinService.deletePin(projectId, pinId))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.FORBIDDEN_ACCESS);

        assertThat(pin.getDeletedAt()).isNull();
        verify(projectPinCommentRepository, never()).softDeleteByPinId(any(UUID.class), any(LocalDateTime.class));
        verifyNoInteractions(projectPinReadStateRepository);
    }

    @Test
    void deletePin_throwsPinNotFound_whenPinDoesNotExist() {
        given(projectPinRepository.findActivePinByProjectId(pinId, projectId))
                .willReturn(Optional.empty());

        assertThatThrownBy(() -> projectPinService.deletePin(projectId, pinId))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.PIN_NOT_FOUND);

        verify(projectAccessService, never()).validateProjectPinWriterOrThrow(any(Project.class), any(UUID.class));
        verify(projectPinCommentRepository, never()).softDeleteByPinId(any(UUID.class), any(LocalDateTime.class));
        verifyNoInteractions(projectPinReadStateRepository);
    }
}
