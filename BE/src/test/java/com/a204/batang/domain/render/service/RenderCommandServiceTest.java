package com.a204.batang.domain.render.service;

import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.repository.ProjectRepository;
import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.domain.render.dto.CreateRenderRequest;
import com.a204.batang.domain.render.dto.CreateRenderResponse;
import com.a204.batang.domain.render.dto.RenderStyleRequest;
import com.a204.batang.domain.render.messaging.SdRenderCommandPublisher;
import com.a204.batang.domain.render.repository.RenderJobRepository;
import com.a204.batang.domain.render.repository.RenderJobStepRepository;
import com.a204.batang.domain.workspace.entity.ProjectWorkspace;
import com.a204.batang.domain.workspace.repository.ProjectWorkspaceRepository;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.a204.batang.domain.render.messaging.event.RenderStatusChangedEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class RenderCommandServiceTest {

    @Mock
    private ProjectRepository projectRepository;
    @Mock
    private ProjectAccessService projectAccessService;
    @Mock
    private ProjectWorkspaceRepository projectWorkspaceRepository;
    @Mock
    private RenderJobRepository renderJobRepository;
    @Mock
    private RenderJobStepRepository renderJobStepRepository;
    @Mock
    private SdRenderCommandPublisher sdRenderCommandPublisher;
    @Mock
    private ApplicationEventPublisher eventPublisher;

    @Spy
    private ObjectMapper objectMapper = new ObjectMapper();

    @InjectMocks
    private RenderCommandService renderCommandService;

    private UUID projectId;
    private UUID userId;
    private Project project;
    private ProjectWorkspace workspace;

    @BeforeEach
    void setUp() throws Exception {
        projectId = UUID.randomUUID();
        userId = UUID.randomUUID();
        project = Project.create("project", "desc", userId);
        ReflectionTestUtils.setField(project, "projectId", projectId);
        ReflectionTestUtils.setField(project, "latestRevisionId", UUID.randomUUID());

        var constructor = ProjectWorkspace.class.getDeclaredConstructor();
        constructor.setAccessible(true);
        workspace = constructor.newInstance();
        ReflectionTestUtils.setField(workspace, "projectId", projectId);
        ReflectionTestUtils.setField(
                workspace,
                "ifcStorageUrl",
                "s3://batang/projects/" + projectId + "/revisions/" + UUID.randomUUID() + "/ifc/model.v1.ifc"
        );
    }

    @Test
    void createRender_createsJobAndPublishesCommand() {
        CreateRenderRequest request = new CreateRenderRequest(
                "quiet library exterior",
                null,
                new RenderStyleRequest("DAY", "EXTERIOR", "SPRING", "CLEAR"),
                null,
                null,
                1024,
                1024
        );

        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        given(projectAccessService.resolveCurrentUserId()).willReturn(userId);
        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId)).willReturn(Optional.of(workspace));
        doNothing().when(sdRenderCommandPublisher).publish(any());

        CreateRenderResponse response = renderCommandService.createRender(projectId, request);

        assertThat(response.projectId()).isEqualTo(projectId);
        assertThat(response.status()).isEqualTo("QUEUED");
        assertThat(response.progress()).isZero();
        assertThat(response.renderId()).isNotNull();
        assertThat(response.jobStepId()).isNotNull();
        assertThat(response.expectedOutputArtifactId()).isNotNull();

        verify(renderJobRepository, times(1)).save(any());
        verify(renderJobStepRepository, times(1)).save(any());
        verify(sdRenderCommandPublisher, times(1)).publish(any());
        // sendRenderSse()는 RenderStatusSseResponse를 받으면 직접 SSE 발송하지 않고
        // ApplicationEventPublisher를 통해 트랜잭션 커밋 후 발송을 위임한다.
        verify(eventPublisher, times(1)).publishEvent(any(RenderStatusChangedEvent.class));
    }

    @Test
    void createRender_throwsWhenProjectDoesNotExist() {
        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.empty());

        assertThatThrownBy(() -> renderCommandService.createRender(projectId, new CreateRenderRequest("prompt", null, null, null, null, null, null)))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.PROJECT_NOT_FOUND);
    }

    @Test
    void createRender_throwsWhenSourceIfcDoesNotExist() {
        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        given(projectAccessService.resolveCurrentUserId()).willReturn(userId);
        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId)).willReturn(Optional.empty());

        assertThatThrownBy(() -> renderCommandService.createRender(projectId, new CreateRenderRequest("prompt", null, null, null, null, null, null)))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.RENDER_SOURCE_NOT_FOUND);
    }

    @Test
    void createRender_propagatesForbiddenAccess() {
        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        given(projectAccessService.resolveCurrentUserId()).willReturn(userId);
        doThrow(new CustomException(ErrorCode.FORBIDDEN_ACCESS))
                .when(projectAccessService)
                .validateProjectOwnerOrThrow(project, userId);

        assertThatThrownBy(() -> renderCommandService.createRender(projectId, new CreateRenderRequest("prompt", null, null, null, null, null, null)))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.FORBIDDEN_ACCESS);
    }

    @Test
    void createRender_throwsWhenPublishFails() {
        CreateRenderRequest request = new CreateRenderRequest("prompt", null, null, null, null, null, null);
        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        given(projectAccessService.resolveCurrentUserId()).willReturn(userId);
        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId)).willReturn(Optional.of(workspace));
        doThrow(new CustomException(ErrorCode.RENDER_COMMAND_PUBLISH_FAILED))
                .when(sdRenderCommandPublisher)
                .publish(any());

        assertThatThrownBy(() -> renderCommandService.createRender(projectId, request))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.RENDER_COMMAND_PUBLISH_FAILED);
    }
}
