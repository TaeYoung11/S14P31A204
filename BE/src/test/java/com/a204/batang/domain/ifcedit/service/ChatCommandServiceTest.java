package com.a204.batang.domain.ifcedit.service;

import com.a204.batang.domain.ifcedit.dto.ChatCommandRequest;
import com.a204.batang.domain.ifcedit.dto.ChatCommandSceneType;
import com.a204.batang.domain.ifcedit.dto.IfcEditJobResponse;
import com.a204.batang.domain.ifcedit.dto.LlmIfcEditRequest;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class ChatCommandServiceTest {

    @Mock
    private TwoDLlmIfcEditCommandService twoDLlmIfcEditCommandService;

    @Mock
    private ThreeDLlmIfcEditCommandService threeDLlmIfcEditCommandService;

    @InjectMocks
    private ChatCommandService service;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private UUID projectId;
    private UUID userId;
    private UUID revisionId;
    private UUID sceneStateId;
    private ObjectNode sourceScene;
    private ObjectNode conversationHistory;
    private ObjectNode plannerOptions;

    @BeforeEach
    void setUp() {
        projectId = UUID.randomUUID();
        userId = UUID.randomUUID();
        revisionId = UUID.randomUUID();
        sceneStateId = UUID.randomUUID();
        sourceScene = objectMapper.createObjectNode().put("scene", "payload");
        conversationHistory = objectMapper.createObjectNode().put("history", "payload");
        plannerOptions = objectMapper.createObjectNode().put("max_commands", 3);
    }

    @Test
    void createChatCommand_routesToTwoDServiceAndMapsRequest() {
        ChatCommandRequest request = new ChatCommandRequest(
                ChatCommandSceneType.TWO_D,
                revisionId,
                "IFC_MODEL",
                "거실 벽을 추가해줘",
                sceneStateId,
                "projects/p/scene-states/s/2d/snapshot.v1.json",
                sourceScene,
                conversationHistory,
                plannerOptions
        );
        IfcEditJobResponse expectedResponse = new IfcEditJobResponse(
                projectId, UUID.randomUUID(), UUID.randomUUID(), null, null,
                "TWO_D_TO_IFC_EDIT", "QUEUED", 0
        );

        given(twoDLlmIfcEditCommandService.createTwoDLlmIfcEdit(eq(projectId), eq(userId), eq(expectedLlmRequest(request))))
                .willReturn(expectedResponse);

        IfcEditJobResponse response = service.createChatCommand(projectId, userId, request);

        assertThat(response).isEqualTo(expectedResponse);
        verify(twoDLlmIfcEditCommandService).createTwoDLlmIfcEdit(eq(projectId), eq(userId), eq(expectedLlmRequest(request)));
    }

    @Test
    void createChatCommand_routesToThreeDServiceAndPreservesOptionalFields() {
        ChatCommandRequest request = new ChatCommandRequest(
                ChatCommandSceneType.THREE_D,
                revisionId,
                "IFC_MODEL",
                "빈 공간에 방을 추가해줘",
                sceneStateId,
                null,
                sourceScene,
                conversationHistory,
                plannerOptions
        );
        IfcEditJobResponse expectedResponse = new IfcEditJobResponse(
                projectId, UUID.randomUUID(), UUID.randomUUID(), null, null,
                "THREE_D_TO_IFC_EDIT", "QUEUED", 0
        );
        ArgumentCaptor<LlmIfcEditRequest> requestCaptor = ArgumentCaptor.forClass(LlmIfcEditRequest.class);

        given(threeDLlmIfcEditCommandService.createThreeDLlmIfcEdit(eq(projectId), eq(userId), requestCaptor.capture()))
                .willReturn(expectedResponse);

        IfcEditJobResponse response = service.createChatCommand(projectId, userId, request);

        assertThat(response).isEqualTo(expectedResponse);
        LlmIfcEditRequest captured = requestCaptor.getValue();
        assertThat(captured.baseRevisionId()).isEqualTo(revisionId);
        assertThat(captured.sourceSceneStateId()).isEqualTo(sceneStateId);
        assertThat(captured.sourceSceneType()).isEqualTo("IFC_MODEL");
        assertThat(captured.userInstruction()).isEqualTo("빈 공간에 방을 추가해줘");
        assertThat(captured.sourceSceneStorageUrl()).isNull();
        assertThat(captured.sourceScene()).isEqualTo(sourceScene);
        assertThat(captured.conversationHistory()).isEqualTo(conversationHistory);
        assertThat(captured.plannerOptions()).isEqualTo(plannerOptions);
    }

    @Test
    void createChatCommand_propagatesTwoDExceptions() {
        ChatCommandRequest request = new ChatCommandRequest(
                ChatCommandSceneType.TWO_D,
                revisionId,
                "IFC_MODEL",
                "에러를 재현해줘",
                sceneStateId,
                "projects/p/scene-states/s/2d/snapshot.v1.json",
                null,
                null,
                null
        );

        given(twoDLlmIfcEditCommandService.createTwoDLlmIfcEdit(eq(projectId), eq(userId), eq(expectedLlmRequest(request))))
                .willThrow(new CustomException(ErrorCode.IFC_EDIT_JOB_CONFLICT));

        assertThatThrownBy(() -> service.createChatCommand(projectId, userId, request))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.IFC_EDIT_JOB_CONFLICT);
    }

    @Test
    void createChatCommand_propagatesThreeDExceptions() {
        ChatCommandRequest request = new ChatCommandRequest(
                ChatCommandSceneType.THREE_D,
                revisionId,
                "IFC_MODEL",
                "에러를 재현해줘",
                sceneStateId,
                "projects/p/scene-states/s/3d/snapshot.v1.json",
                null,
                null,
                null
        );

        given(threeDLlmIfcEditCommandService.createThreeDLlmIfcEdit(eq(projectId), eq(userId), eq(expectedLlmRequest(request))))
                .willThrow(new CustomException(ErrorCode.IFC_EDIT_COMMAND_PUBLISH_FAILED));

        assertThatThrownBy(() -> service.createChatCommand(projectId, userId, request))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.IFC_EDIT_COMMAND_PUBLISH_FAILED);
    }

    private LlmIfcEditRequest expectedLlmRequest(ChatCommandRequest request) {
        return new LlmIfcEditRequest(
                request.baseRevisionId(),
                request.sourceSceneStateId(),
                request.sourceSceneType(),
                request.message(),
                request.sourceSceneStorageUrl(),
                request.sourceScene(),
                request.conversationHistory(),
                request.plannerOptions()
        );
    }
}
