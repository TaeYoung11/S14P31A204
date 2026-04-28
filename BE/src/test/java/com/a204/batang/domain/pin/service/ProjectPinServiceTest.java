package com.a204.batang.domain.pin.service;

import com.a204.batang.domain.pin.dto.PinPositionRequest;
import com.a204.batang.domain.pin.dto.UpdatePinPositionRequest;
import com.a204.batang.domain.pin.dto.UpdatePinPositionResponse;
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
    void updatePinPosition_updatesCameraAndWorldPosition_whenCurrentUserIsAuthor() {
        UpdatePinPositionRequest request = new UpdatePinPositionRequest(
                new PinPositionRequest(5.0, 6.0, 7.0),
                new PinPositionRequest(50.0, 60.0, 70.0)
        );
        LocalDateTime updatedAt = LocalDateTime.of(2026, 4, 28, 9, 30, 0);

        given(projectPinRepository.findActivePinByProjectId(pinId, projectId))
                .willReturn(Optional.of(pin));
        given(projectAccessService.resolveCurrentUserId()).willReturn(authorUserId);
        ReflectionTestUtils.setField(pin, "updatedAt", updatedAt);

        UpdatePinPositionResponse response = projectPinService.updatePinPosition(projectId, pinId, request);

        assertThat(pin.getCameraPosition().getX()).isEqualTo(5.0);
        assertThat(pin.getCameraPosition().getY()).isEqualTo(6.0);
        assertThat(pin.getCameraPosition().getZ()).isEqualTo(7.0);
        assertThat(pin.getWorldPosition().getX()).isEqualTo(50.0);
        assertThat(pin.getWorldPosition().getY()).isEqualTo(60.0);
        assertThat(pin.getWorldPosition().getZ()).isEqualTo(70.0);

        assertThat(response.pinId()).isEqualTo(pinId);
        assertThat(response.cameraPosition().x()).isEqualTo(5.0);
        assertThat(response.cameraPosition().y()).isEqualTo(6.0);
        assertThat(response.cameraPosition().z()).isEqualTo(7.0);
        assertThat(response.worldPosition().x()).isEqualTo(50.0);
        assertThat(response.worldPosition().y()).isEqualTo(60.0);
        assertThat(response.worldPosition().z()).isEqualTo(70.0);
        assertThat(response.updatedAt()).isEqualTo(updatedAt);

        verify(projectPinRepository).flush();
        verify(projectAccessService).validateProjectPinWriterOrThrow(project, authorUserId);
        verifyNoInteractions(projectPinCommentRepository);
        verifyNoInteractions(projectPinReadStateRepository);
    }

    @Test
    void updatePinPosition_throwsForbidden_whenCurrentUserIsNotAuthor() {
        UUID otherUserId = UUID.randomUUID();
        UpdatePinPositionRequest request = new UpdatePinPositionRequest(
                new PinPositionRequest(5.0, 6.0, 7.0),
                new PinPositionRequest(50.0, 60.0, 70.0)
        );

        given(projectPinRepository.findActivePinByProjectId(pinId, projectId))
                .willReturn(Optional.of(pin));
        given(projectAccessService.resolveCurrentUserId()).willReturn(otherUserId);

        assertThatThrownBy(() -> projectPinService.updatePinPosition(projectId, pinId, request))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.FORBIDDEN_ACCESS);

        verify(projectPinCommentRepository, never()).softDeleteByPinId(any(UUID.class), any(LocalDateTime.class));
        verifyNoInteractions(projectPinReadStateRepository);
    }

    @Test
    void updatePinPosition_throwsPinNotFound_whenPinDoesNotExist() {
        UpdatePinPositionRequest request = new UpdatePinPositionRequest(
                new PinPositionRequest(5.0, 6.0, 7.0),
                new PinPositionRequest(50.0, 60.0, 70.0)
        );

        given(projectPinRepository.findActivePinByProjectId(pinId, projectId))
                .willReturn(Optional.empty());

        assertThatThrownBy(() -> projectPinService.updatePinPosition(projectId, pinId, request))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.PIN_NOT_FOUND);

        verify(projectAccessService, never()).validateProjectPinWriterOrThrow(any(Project.class), any(UUID.class));
        verifyNoInteractions(projectPinCommentRepository);
        verifyNoInteractions(projectPinReadStateRepository);
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
