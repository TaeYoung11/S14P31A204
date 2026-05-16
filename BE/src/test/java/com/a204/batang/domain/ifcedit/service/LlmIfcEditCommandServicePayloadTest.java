package com.a204.batang.domain.ifcedit.service;

import com.a204.batang.domain.ifcedit.dto.LlmIfcEditRequest;
import com.a204.batang.domain.ifcedit.messaging.event.IfcEditCommandPublishRequestedEvent;
import com.a204.batang.domain.ifcedit.repository.IfcEditJobRepository;
import com.a204.batang.domain.ifcedit.repository.IfcEditJobStepRepository;
import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.repository.ProjectRepository;
import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.domain.revision.entity.Revision;
import com.a204.batang.domain.revision.repository.RevisionRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class LlmIfcEditCommandServicePayloadTest {

    @Mock private ProjectRepository projectRepository;
    @Mock private RevisionRepository revisionRepository;
    @Mock private ProjectAccessService projectAccessService;
    @Mock private IfcEditJobRepository ifcEditJobRepository;
    @Mock private IfcEditJobStepRepository ifcEditJobStepRepository;
    @Mock private IfcEditStoragePathBuilder pathBuilder;
    @Mock private ApplicationEventPublisher eventPublisher;

    private ObjectMapper objectMapper;
    private UUID projectId;
    private UUID userId;
    private UUID baseRevisionId;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        projectId = UUID.randomUUID();
        userId = UUID.randomUUID();
        baseRevisionId = UUID.randomUUID();

        given(projectRepository.findByProjectIdAndDeletedAtIsNullForUpdate(projectId))
                .willReturn(Optional.of(Project.create("llm-test", "desc")));
        given(revisionRepository.findById(baseRevisionId)).willReturn(Optional.of(mock(Revision.class)));
        given(ifcEditJobRepository.existsByProjectIdAndJobTypeInAndStatusIn(any(), any(), any())).willReturn(false);
        given(pathBuilder.buildSourceIfcStorageUrl(projectId, baseRevisionId)).willReturn("s3://bucket/source.ifc");
    }

    @Test
    void twoDLlmCommandPayloadIncludesSchemaVersion() {
        given(pathBuilder.buildTwoDPlannerOutputStorageUrl(any(), any(), anyInt()))
                .willReturn("s3://bucket/2d-plan.json");
        TwoDLlmIfcEditCommandService service = new TwoDLlmIfcEditCommandService(
                projectRepository,
                revisionRepository,
                projectAccessService,
                ifcEditJobRepository,
                ifcEditJobStepRepository,
                pathBuilder,
                eventPublisher,
                objectMapper
        );

        service.createTwoDLlmIfcEdit(projectId, userId, request());

        JsonNode payload = publishedPayload();
        assertThat(payload.get("schema_version").asText()).isEqualTo("v1");
        assertThat(payload.get("user_instruction").asText()).isEqualTo("벽을 추가해줘");
    }

    @Test
    void threeDLlmCommandPayloadIncludesSchemaVersion() {
        given(pathBuilder.buildThreeDPlannerOutputStorageUrl(any(), any(), anyInt()))
                .willReturn("s3://bucket/3d-plan.json");
        ThreeDLlmIfcEditCommandService service = new ThreeDLlmIfcEditCommandService(
                projectRepository,
                revisionRepository,
                projectAccessService,
                ifcEditJobRepository,
                ifcEditJobStepRepository,
                pathBuilder,
                eventPublisher,
                objectMapper
        );

        service.createThreeDLlmIfcEdit(projectId, userId, request());

        JsonNode payload = publishedPayload();
        assertThat(payload.get("schema_version").asText()).isEqualTo("v1");
        assertThat(payload.get("userInstruction").asText()).isEqualTo("벽을 추가해줘");
        assertThat(payload.get("sourceSceneStorageUrl").asText()).isEqualTo("s3://bucket/source.ifc");
    }

    private LlmIfcEditRequest request() {
        return new LlmIfcEditRequest(
                baseRevisionId,
                UUID.randomUUID(),
                "IFC_MODEL",
                "벽을 추가해줘",
                null,
                null,
                null,
                null
        );
    }

    private JsonNode publishedPayload() {
        ArgumentCaptor<Object> eventCaptor = ArgumentCaptor.forClass(Object.class);
        verify(eventPublisher, atLeastOnce()).publishEvent(eventCaptor.capture());
        return eventCaptor.getAllValues().stream()
                .filter(IfcEditCommandPublishRequestedEvent.class::isInstance)
                .map(IfcEditCommandPublishRequestedEvent.class::cast)
                .map(IfcEditCommandPublishRequestedEvent::message)
                .findFirst()
                .orElseThrow()
                .payload();
    }
}
