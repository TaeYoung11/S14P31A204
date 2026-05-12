package com.a204.batang.domain.project.controller;

import com.a204.batang.domain.project.dto.ProjectInvitationResponse;
import com.a204.batang.domain.project.dto.ProjectMemberRemovalResponse;
import com.a204.batang.domain.project.entity.ProjectMemberRole;
import com.a204.batang.domain.project.service.ProjectInvitationService;
import com.a204.batang.domain.project.service.ProjectMemberService;
import com.a204.batang.domain.project.service.ProjectQueryService;
import com.a204.batang.domain.project.service.ProjectService;
import com.a204.batang.domain.project.service.ProjectSiteService;
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
import java.time.LocalDateTime;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ProjectController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class ProjectControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ProjectService projectService;

    @MockitoBean
    private ProjectQueryService projectQueryService;

    @MockitoBean
    private ProjectSiteService projectSiteService;

    @MockitoBean
    private ProjectInvitationService projectInvitationService;

    @MockitoBean
    private ProjectMemberService projectMemberService;

    @MockitoBean
    private JpaMetamodelMappingContext jpaMetamodelMappingContext;

    @MockitoBean
    private JwtAuthFilter jwtAuthFilter;

    @Test
    void inviteProjectMember_returnsCreatedWrappedResponse() throws Exception {
        UUID projectId = UUID.randomUUID();
        UUID invitedUserId = UUID.randomUUID();
        ProjectInvitationResponse response = new ProjectInvitationResponse(
                projectId,
                invitedUserId,
                "테스트 사용자",
                "client@example.com",
                ProjectMemberRole.CLIENT
        );

        given(projectInvitationService.inviteProjectMember(eq(projectId), any()))
                .willReturn(response);

        mockMvc.perform(post("/api/v1/projects/{projectId}/invitations", projectId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "inviteeEmail": "client@example.com"
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value(201))
                .andExpect(jsonPath("$.message").value("프로젝트 멤버 초대 완료"))
                .andExpect(jsonPath("$.data.projectId").value(projectId.toString()))
                .andExpect(jsonPath("$.data.invitedUserId").value(invitedUserId.toString()))
                .andExpect(jsonPath("$.data.invitedUserName").value("테스트 사용자"))
                .andExpect(jsonPath("$.data.invitedUserEmail").value("client@example.com"))
                .andExpect(jsonPath("$.data.role").value("CLIENT"));
    }

    @Test
    void inviteProjectMember_returnsBadRequestWhenInviteeEmailIsBlank() throws Exception {
        mockMvc.perform(post("/api/v1/projects/{projectId}/invitations", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "inviteeEmail": " "
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.code").value("COMMON_INVALID_REQUEST"));
    }

    @Test
    void inviteProjectMember_returnsBadRequestWhenInviteeEmailFormatIsInvalid() throws Exception {
        mockMvc.perform(post("/api/v1/projects/{projectId}/invitations", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "inviteeEmail": "not-email"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.code").value("COMMON_INVALID_REQUEST"));
    }

    @Test
    void inviteProjectMember_returnsBadRequestWhenProjectIdIsInvalidUuid() throws Exception {
        mockMvc.perform(post("/api/v1/projects/{projectId}/invitations", "not-a-uuid")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "inviteeEmail": "client@example.com"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.code").value("COMMON_INVALID_REQUEST"));
    }

    @Test
    void inviteProjectMember_returnsNotFoundWhenInviteeDoesNotExist() throws Exception {
        UUID projectId = UUID.randomUUID();
        given(projectInvitationService.inviteProjectMember(eq(projectId), any()))
                .willThrow(new CustomException(ErrorCode.INVITEE_NOT_FOUND));

        mockMvc.perform(post("/api/v1/projects/{projectId}/invitations", projectId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "inviteeEmail": "missing@example.com"
                                }
                                """))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.code").value("INVITEE_NOT_FOUND"));
    }

    @Test
    void inviteProjectMember_returnsForbiddenWhenCurrentUserIsNotOwner() throws Exception {
        UUID projectId = UUID.randomUUID();
        given(projectInvitationService.inviteProjectMember(eq(projectId), any()))
                .willThrow(new CustomException(ErrorCode.FORBIDDEN_ACCESS));

        mockMvc.perform(post("/api/v1/projects/{projectId}/invitations", projectId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "inviteeEmail": "client@example.com"
                                }
                                """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403))
                .andExpect(jsonPath("$.code").value("COMMON_FORBIDDEN_ACCESS"));
    }

    @Test
    void inviteProjectMember_returnsConflictWhenProjectMemberAlreadyExists() throws Exception {
        UUID projectId = UUID.randomUUID();
        given(projectInvitationService.inviteProjectMember(eq(projectId), any()))
                .willThrow(new CustomException(ErrorCode.PROJECT_MEMBER_ALREADY_EXISTS));

        mockMvc.perform(post("/api/v1/projects/{projectId}/invitations", projectId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "inviteeEmail": "client@example.com"
                                }
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value(409))
                .andExpect(jsonPath("$.code").value("PROJECT_MEMBER_ALREADY_EXISTS"));
    }
}
