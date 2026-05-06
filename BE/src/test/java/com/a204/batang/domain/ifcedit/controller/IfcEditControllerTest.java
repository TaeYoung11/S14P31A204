package com.a204.batang.domain.ifcedit.controller;

import com.a204.batang.domain.ifcedit.dto.IfcEditJobResponse;
import com.a204.batang.domain.ifcedit.service.ChatCommandService;
import com.a204.batang.domain.ifcedit.service.DirectIfcEditCommandService;
import com.a204.batang.domain.ifcedit.service.ThreeDLlmIfcEditCommandService;
import com.a204.batang.domain.ifcedit.service.TwoDLlmIfcEditCommandService;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.a204.batang.global.exception.controller.GlobalExceptionHandler;
import com.a204.batang.global.jwt.JwtAuthFilter;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.jpa.mapping.JpaMetamodelMappingContext;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static com.a204.batang.domain.ifcedit.IfcEditConstants.JOB_TYPE_IFC_EDIT;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(IfcEditController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class IfcEditControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ChatCommandService chatCommandService;

    @MockitoBean
    private DirectIfcEditCommandService directIfcEditCommandService;

    @MockitoBean
    private TwoDLlmIfcEditCommandService twoDLlmIfcEditCommandService;

    @MockitoBean
    private ThreeDLlmIfcEditCommandService threeDLlmIfcEditCommandService;

    @MockitoBean
    private JpaMetamodelMappingContext jpaMetamodelMappingContext;

    @MockitoBean
    private JwtAuthFilter jwtAuthFilter;

    private static final String DIRECT_URL = "/api/v1/projects/{projectId}/ifc-edit/direct";
    private static final String CHAT_COMMAND_URL = "/api/v1/projects/{projectId}/chat-commands";
    private static final String TWO_D_LLM_URL = "/api/v1/projects/{projectId}/ifc-edit/2d-llm";
    private static final String THREE_D_LLM_URL = "/api/v1/projects/{projectId}/ifc-edit/3d-llm";

    private static final String DIRECT_REQUEST_BODY = """
            {
              "schemaVersion": "v1",
              "baseRevisionId": "11111111-1111-1111-1111-111111111111",
              "engineRequest": {"operation": "add_wall"}
            }
            """;

    private static final String TWO_D_LLM_REQUEST_BODY = """
            {
              "baseRevisionId": "11111111-1111-1111-1111-111111111111",
              "userInstruction": "벽을 추가해줘"
            }
            """;

    private static final String THREE_D_LLM_REQUEST_BODY = """
            {
              "baseRevisionId": "11111111-1111-1111-1111-111111111111",
              "userInstruction": "벽을 추가해줘"
            }
            """;

    private static final String CHAT_COMMAND_TWO_D_REQUEST_BODY = """
            {
              "sceneType": "TWO_D",
              "baseRevisionId": "11111111-1111-1111-1111-111111111111",
              "sourceSceneType": "IFC_MODEL",
              "message": "벽을 추가해줘",
              "sourceSceneStorageUrl": "projects/p/scene-states/s/2d/snapshot.v1.json"
            }
            """;

    private static final String CHAT_COMMAND_THREE_D_REQUEST_BODY = """
            {
              "sceneType": "THREE_D",
              "baseRevisionId": "11111111-1111-1111-1111-111111111111",
              "sourceSceneType": "IFC_MODEL",
              "message": "빈 공간을 채워줘",
              "sourceScene": {
                "nodes": []
              }
            }
            """;

    @Test
    void directIfcEdit_success_returns200() throws Exception {
        UUID projectId = UUID.randomUUID();
        UUID jobId = UUID.randomUUID();
        UUID jobStepId = UUID.randomUUID();
        UUID targetRevisionId = UUID.randomUUID();
        UUID expectedOutputArtifactId = UUID.randomUUID();

        given(directIfcEditCommandService.createDirectIfcEdit(eq(projectId), any(), any()))
                .willReturn(new IfcEditJobResponse(
                        projectId, jobId, jobStepId, targetRevisionId, expectedOutputArtifactId,
                        JOB_TYPE_IFC_EDIT, "QUEUED", 0
                ));

        mockMvc.perform(post(DIRECT_URL, projectId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(DIRECT_REQUEST_BODY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(200))
                .andExpect(jsonPath("$.message").value("IFC 편집 작업 등록 성공"))
                .andExpect(jsonPath("$.data.projectId").value(projectId.toString()))
                .andExpect(jsonPath("$.data.jobId").value(jobId.toString()))
                .andExpect(jsonPath("$.data.jobStepId").value(jobStepId.toString()))
                .andExpect(jsonPath("$.data.targetRevisionId").value(targetRevisionId.toString()))
                .andExpect(jsonPath("$.data.jobType").value(JOB_TYPE_IFC_EDIT))
                .andExpect(jsonPath("$.data.status").value("QUEUED"))
                .andExpect(jsonPath("$.data.progress").value(0));
    }

    @Test
    void chatCommand_twoD_success_returns200() throws Exception {
        UUID projectId = UUID.randomUUID();
        UUID jobId = UUID.randomUUID();
        UUID jobStepId = UUID.randomUUID();

        given(chatCommandService.createChatCommand(eq(projectId), any(), any()))
                .willReturn(new IfcEditJobResponse(
                        projectId, jobId, jobStepId, null, null,
                        "TWO_D_TO_IFC_EDIT", "QUEUED", 0
                ));

        mockMvc.perform(post(CHAT_COMMAND_URL, projectId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(CHAT_COMMAND_TWO_D_REQUEST_BODY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(200))
                .andExpect(jsonPath("$.message").value("채팅 편집 작업 등록 성공"))
                .andExpect(jsonPath("$.data.projectId").value(projectId.toString()))
                .andExpect(jsonPath("$.data.jobId").value(jobId.toString()))
                .andExpect(jsonPath("$.data.jobType").value("TWO_D_TO_IFC_EDIT"))
                .andExpect(jsonPath("$.data.status").value("QUEUED"))
                .andExpect(jsonPath("$.data.progress").value(0));
    }

    @Test
    void chatCommand_threeD_success_returns200() throws Exception {
        UUID projectId = UUID.randomUUID();
        UUID jobId = UUID.randomUUID();
        UUID jobStepId = UUID.randomUUID();

        given(chatCommandService.createChatCommand(eq(projectId), any(), any()))
                .willReturn(new IfcEditJobResponse(
                        projectId, jobId, jobStepId, null, null,
                        "THREE_D_TO_IFC_EDIT", "QUEUED", 0
                ));

        mockMvc.perform(post(CHAT_COMMAND_URL, projectId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(CHAT_COMMAND_THREE_D_REQUEST_BODY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(200))
                .andExpect(jsonPath("$.message").value("채팅 편집 작업 등록 성공"))
                .andExpect(jsonPath("$.data.projectId").value(projectId.toString()))
                .andExpect(jsonPath("$.data.jobId").value(jobId.toString()))
                .andExpect(jsonPath("$.data.jobType").value("THREE_D_TO_IFC_EDIT"))
                .andExpect(jsonPath("$.data.status").value("QUEUED"))
                .andExpect(jsonPath("$.data.progress").value(0));
    }

    @Test
    void chatCommand_missingSceneType_returns400() throws Exception {
        UUID projectId = UUID.randomUUID();

        mockMvc.perform(post(CHAT_COMMAND_URL, projectId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "baseRevisionId": "11111111-1111-1111-1111-111111111111",
                                  "sourceSceneType": "IFC_MODEL",
                                  "message": "벽을 추가해줘",
                                  "sourceSceneStorageUrl": "projects/p/scene-states/s/2d/snapshot.v1.json"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("COMMON_INVALID_REQUEST"));
    }

    @Test
    void chatCommand_invalidSceneType_returns400() throws Exception {
        UUID projectId = UUID.randomUUID();

        mockMvc.perform(post(CHAT_COMMAND_URL, projectId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "sceneType": "two_d",
                                  "baseRevisionId": "11111111-1111-1111-1111-111111111111",
                                  "sourceSceneType": "IFC_MODEL",
                                  "message": "벽을 추가해줘",
                                  "sourceSceneStorageUrl": "projects/p/scene-states/s/2d/snapshot.v1.json"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("COMMON_INVALID_REQUEST"));
    }

    @Test
    void chatCommand_missingSceneSource_returns400() throws Exception {
        UUID projectId = UUID.randomUUID();

        mockMvc.perform(post(CHAT_COMMAND_URL, projectId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "sceneType": "TWO_D",
                                  "baseRevisionId": "11111111-1111-1111-1111-111111111111",
                                  "sourceSceneType": "IFC_MODEL",
                                  "message": "벽을 추가해줘"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("COMMON_INVALID_REQUEST"));
    }

    @Test
    void chatCommand_projectNotFound_returns404() throws Exception {
        UUID projectId = UUID.randomUUID();
        given(chatCommandService.createChatCommand(eq(projectId), any(), any()))
                .willThrow(new CustomException(ErrorCode.PROJECT_NOT_FOUND));

        mockMvc.perform(post(CHAT_COMMAND_URL, projectId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(CHAT_COMMAND_TWO_D_REQUEST_BODY))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("PROJECT_NOT_FOUND"));
    }

    @Test
    void chatCommand_forbidden_returns403() throws Exception {
        UUID projectId = UUID.randomUUID();
        given(chatCommandService.createChatCommand(eq(projectId), any(), any()))
                .willThrow(new CustomException(ErrorCode.FORBIDDEN_ACCESS));

        mockMvc.perform(post(CHAT_COMMAND_URL, projectId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(CHAT_COMMAND_TWO_D_REQUEST_BODY))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("COMMON_FORBIDDEN_ACCESS"));
    }

    @Test
    void chatCommand_conflict_returns409() throws Exception {
        UUID projectId = UUID.randomUUID();
        given(chatCommandService.createChatCommand(eq(projectId), any(), any()))
                .willThrow(new CustomException(ErrorCode.IFC_EDIT_JOB_CONFLICT));

        mockMvc.perform(post(CHAT_COMMAND_URL, projectId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(CHAT_COMMAND_TWO_D_REQUEST_BODY))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("IFC_EDIT_JOB_CONFLICT"));
    }

    @Test
    void chatCommand_sourceNotFound_returns409() throws Exception {
        UUID projectId = UUID.randomUUID();
        given(chatCommandService.createChatCommand(eq(projectId), any(), any()))
                .willThrow(new CustomException(ErrorCode.IFC_EDIT_SOURCE_NOT_FOUND));

        mockMvc.perform(post(CHAT_COMMAND_URL, projectId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(CHAT_COMMAND_TWO_D_REQUEST_BODY))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("IFC_EDIT_SOURCE_NOT_FOUND"));
    }

    @Test
    void chatCommand_publishFailed_returns502() throws Exception {
        UUID projectId = UUID.randomUUID();
        given(chatCommandService.createChatCommand(eq(projectId), any(), any()))
                .willThrow(new CustomException(ErrorCode.IFC_EDIT_COMMAND_PUBLISH_FAILED));

        mockMvc.perform(post(CHAT_COMMAND_URL, projectId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(CHAT_COMMAND_TWO_D_REQUEST_BODY))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("IFC_EDIT_COMMAND_PUBLISH_FAILED"));
    }

    @Test
    void directIfcEdit_conflict_returns409() throws Exception {
        UUID projectId = UUID.randomUUID();
        given(directIfcEditCommandService.createDirectIfcEdit(eq(projectId), any(), any()))
                .willThrow(new CustomException(ErrorCode.IFC_EDIT_JOB_CONFLICT));

        mockMvc.perform(post(DIRECT_URL, projectId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(DIRECT_REQUEST_BODY))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("IFC_EDIT_JOB_CONFLICT"));
    }

    @Test
    void directIfcEdit_sourceNotFound_returns409() throws Exception {
        UUID projectId = UUID.randomUUID();
        given(directIfcEditCommandService.createDirectIfcEdit(eq(projectId), any(), any()))
                .willThrow(new CustomException(ErrorCode.IFC_EDIT_SOURCE_NOT_FOUND));

        mockMvc.perform(post(DIRECT_URL, projectId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(DIRECT_REQUEST_BODY))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("IFC_EDIT_SOURCE_NOT_FOUND"));
    }

    @Test
    void directIfcEdit_projectNotFound_returns404() throws Exception {
        UUID projectId = UUID.randomUUID();
        given(directIfcEditCommandService.createDirectIfcEdit(eq(projectId), any(), any()))
                .willThrow(new CustomException(ErrorCode.PROJECT_NOT_FOUND));

        mockMvc.perform(post(DIRECT_URL, projectId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(DIRECT_REQUEST_BODY))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("PROJECT_NOT_FOUND"));
    }

    @Test
    void directIfcEdit_publishFailed_returns502() throws Exception {
        UUID projectId = UUID.randomUUID();
        given(directIfcEditCommandService.createDirectIfcEdit(eq(projectId), any(), any()))
                .willThrow(new CustomException(ErrorCode.IFC_EDIT_COMMAND_PUBLISH_FAILED));

        mockMvc.perform(post(DIRECT_URL, projectId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(DIRECT_REQUEST_BODY))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("IFC_EDIT_COMMAND_PUBLISH_FAILED"));
    }

    @Test
    void twoDLlmIfcEdit_success_returns200() throws Exception {
        UUID projectId = UUID.randomUUID();
        UUID jobId = UUID.randomUUID();
        UUID jobStepId = UUID.randomUUID();

        given(twoDLlmIfcEditCommandService.createTwoDLlmIfcEdit(eq(projectId), any(), any()))
                .willReturn(new IfcEditJobResponse(
                        projectId, jobId, jobStepId, null, null,
                        "TWO_D_TO_IFC_EDIT", "QUEUED", 0
                ));

        mockMvc.perform(post(TWO_D_LLM_URL, projectId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(TWO_D_LLM_REQUEST_BODY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(200))
                .andExpect(jsonPath("$.message").value("IFC 편집 작업 등록 성공"))
                .andExpect(jsonPath("$.data.projectId").value(projectId.toString()))
                .andExpect(jsonPath("$.data.jobId").value(jobId.toString()))
                .andExpect(jsonPath("$.data.jobType").value("TWO_D_TO_IFC_EDIT"))
                .andExpect(jsonPath("$.data.status").value("QUEUED"))
                .andExpect(jsonPath("$.data.progress").value(0));
    }

    @Test
    void twoDLlmIfcEdit_conflict_returns409() throws Exception {
        UUID projectId = UUID.randomUUID();
        given(twoDLlmIfcEditCommandService.createTwoDLlmIfcEdit(eq(projectId), any(), any()))
                .willThrow(new CustomException(ErrorCode.IFC_EDIT_JOB_CONFLICT));

        mockMvc.perform(post(TWO_D_LLM_URL, projectId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(TWO_D_LLM_REQUEST_BODY))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("IFC_EDIT_JOB_CONFLICT"));
    }

    @Test
    void twoDLlmIfcEdit_sourceNotFound_returns409() throws Exception {
        UUID projectId = UUID.randomUUID();
        given(twoDLlmIfcEditCommandService.createTwoDLlmIfcEdit(eq(projectId), any(), any()))
                .willThrow(new CustomException(ErrorCode.IFC_EDIT_SOURCE_NOT_FOUND));

        mockMvc.perform(post(TWO_D_LLM_URL, projectId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(TWO_D_LLM_REQUEST_BODY))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("IFC_EDIT_SOURCE_NOT_FOUND"));
    }

    @Test
    void threeDLlmIfcEdit_success_returns200() throws Exception {
        UUID projectId = UUID.randomUUID();
        UUID jobId = UUID.randomUUID();
        UUID jobStepId = UUID.randomUUID();

        given(threeDLlmIfcEditCommandService.createThreeDLlmIfcEdit(eq(projectId), any(), any()))
                .willReturn(new IfcEditJobResponse(
                        projectId, jobId, jobStepId, null, null,
                        "THREE_D_TO_IFC_EDIT", "QUEUED", 0
                ));

        mockMvc.perform(post(THREE_D_LLM_URL, projectId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(THREE_D_LLM_REQUEST_BODY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(200))
                .andExpect(jsonPath("$.message").value("IFC 편집 작업 등록 성공"))
                .andExpect(jsonPath("$.data.projectId").value(projectId.toString()))
                .andExpect(jsonPath("$.data.jobId").value(jobId.toString()))
                .andExpect(jsonPath("$.data.jobType").value("THREE_D_TO_IFC_EDIT"))
                .andExpect(jsonPath("$.data.status").value("QUEUED"))
                .andExpect(jsonPath("$.data.progress").value(0));
    }

    @Test
    void threeDLlmIfcEdit_conflict_returns409() throws Exception {
        UUID projectId = UUID.randomUUID();
        given(threeDLlmIfcEditCommandService.createThreeDLlmIfcEdit(eq(projectId), any(), any()))
                .willThrow(new CustomException(ErrorCode.IFC_EDIT_JOB_CONFLICT));

        mockMvc.perform(post(THREE_D_LLM_URL, projectId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(THREE_D_LLM_REQUEST_BODY))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("IFC_EDIT_JOB_CONFLICT"));
    }

    @Test
    void threeDLlmIfcEdit_sourceNotFound_returns409() throws Exception {
        UUID projectId = UUID.randomUUID();
        given(threeDLlmIfcEditCommandService.createThreeDLlmIfcEdit(eq(projectId), any(), any()))
                .willThrow(new CustomException(ErrorCode.IFC_EDIT_SOURCE_NOT_FOUND));

        mockMvc.perform(post(THREE_D_LLM_URL, projectId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(THREE_D_LLM_REQUEST_BODY))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("IFC_EDIT_SOURCE_NOT_FOUND"));
    }
}
