package com.a204.batang.domain.project.controller;

import com.a204.batang.domain.project.dto.CreateProjectRequest;
import com.a204.batang.domain.project.dto.CreateProjectResponse;
import com.a204.batang.domain.project.dto.DeleteProjectsRequest;
import com.a204.batang.domain.project.dto.DeleteProjectsResponse;
import com.a204.batang.domain.project.dto.ProjectDetailResponse;
import com.a204.batang.domain.project.dto.ProjectInvitationRequest;
import com.a204.batang.domain.project.dto.ProjectInvitationResponse;
import com.a204.batang.domain.project.dto.ProjectListResponse;
import com.a204.batang.domain.project.dto.ProjectSiteResponse;
import com.a204.batang.domain.project.dto.RegisterProjectSiteRequest;
import com.a204.batang.domain.project.dto.UpdateProjectRequest;
import com.a204.batang.domain.project.dto.UpdateProjectResponse;
import com.a204.batang.domain.project.service.ProjectInvitationService;
import com.a204.batang.domain.project.service.ProjectQueryService;
import com.a204.batang.domain.project.service.ProjectService;
import com.a204.batang.domain.project.service.ProjectSiteService;
import com.a204.batang.global.common.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * 프로젝트 생성/수정/조회/삭제 및 대지 정보 등록 API를 제공한다.
 */
@Validated
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/projects")
public class ProjectController {

    private final ProjectService projectService;
    private final ProjectQueryService projectQueryService;
    private final ProjectSiteService projectSiteService;
    private final ProjectInvitationService projectInvitationService;

    /**
     * 새 프로젝트를 생성한다.
     *
     * @param request 프로젝트 생성 요청
     * @return 생성 결과
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<CreateProjectResponse> createProject(@Valid @RequestBody CreateProjectRequest request) {
        CreateProjectResponse response = projectService.createProject(request);
        return ApiResponse.created("프로젝트 생성 완료", response);
    }

    /**
     * 프로젝트 이름/설명을 수정한다.
     *
     * @param projectId 프로젝트 ID
     * @param request 수정 요청
     * @return 수정 결과
     */
    @PatchMapping("/{projectId}")
    public ApiResponse<UpdateProjectResponse> updateProject(
            @PathVariable UUID projectId,
            @Valid @RequestBody UpdateProjectRequest request
    ) {
        UpdateProjectResponse response = projectService.updateProject(projectId, request);
        return ApiResponse.success("프로젝트 수정 완료", response);
    }

    /**
     * 내가 접근 가능한 프로젝트 목록을 조회한다.
     *
     * @param page 1-base 페이지 번호
     * @return 프로젝트 목록
     */
    @GetMapping
    public ApiResponse<ProjectListResponse> getMyProjects(
            @RequestParam(defaultValue = "1") @Min(value = 1, message = "page는 1 이상이어야 합니다.") int page
    ) {
        ProjectListResponse response = projectQueryService.getMyProjects(page);
        return ApiResponse.success("프로젝트 목록 조회 성공", response);
    }

    /**
     * 프로젝트 진입에 필요한 상세 정보를 조회한다.
     * 버블 편집 중이면 버블 스냅샷을, 편집 종료 상태면 IFC URL을 반환한다.
     * 대지 정보는 항상 함께 반환한다.
     *
     * @param projectId 프로젝트 ID
     * @return 프로젝트 상세 정보
     */
    @GetMapping("/{projectId}")
    public ApiResponse<ProjectDetailResponse> getMyProjectDetail(@PathVariable UUID projectId) {
        ProjectDetailResponse response = projectQueryService.getMyProjectDetail(projectId);
        return ApiResponse.success("프로젝트 불러오기에 성공했습니다.", response);
    }

    /**
     * 내 프로젝트를 이름 기준으로 검색한다.
     *
     * @param keyword 검색어
     * @param page 1-base 페이지 번호
     * @return 검색 결과
     */
    @GetMapping("/search")
    public ApiResponse<ProjectListResponse> searchMyProjects(
            @RequestParam @NotBlank(message = "keyword는 필수입니다.") String keyword,
            @RequestParam(defaultValue = "1") @Min(value = 1, message = "page는 1 이상이어야 합니다.") int page
    ) {
        ProjectListResponse response = projectQueryService.searchMyProjects(keyword, page);
        return ApiResponse.success("프로젝트 검색 성공", response);
    }

    /**
     * 프로젝트를 소프트 삭제한다.
     *
     * @param request 삭제할 프로젝트 ID 목록
     * @return 삭제 결과
     */
    @DeleteMapping
    public ApiResponse<DeleteProjectsResponse> deleteProjects(@Valid @RequestBody DeleteProjectsRequest request) {
        DeleteProjectsResponse response = projectService.deleteProjects(request);
        return ApiResponse.success("프로젝트 삭제 완료", response);
    }

    /**
     * 프로젝트 대지 정보를 등록한다.
     *
     * @param projectId 프로젝트 ID
     * @param request 대지 등록 요청
     * @return 대지 등록 결과
     */
    @PostMapping("/{projectId}/site")
    public ApiResponse<ProjectSiteResponse> registerProjectSite(
            @PathVariable UUID projectId,
            @Valid @RequestBody RegisterProjectSiteRequest request
    ) {
        ProjectSiteResponse response = projectSiteService.registerProjectSite(projectId, request);
        return ApiResponse.success("대지정보 등록 완료", response);
    }

    /**
     * 프로젝트 owner가 가입된 사용자를 프로젝트 CLIENT 멤버로 초대한다.
     *
     * @param projectId 프로젝트 ID
     * @param request 초대 요청
     * @return 초대 결과
     */
    @PostMapping("/{projectId}/invitations")
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<ProjectInvitationResponse> inviteProjectMember(
            @PathVariable UUID projectId,
            @Valid @RequestBody ProjectInvitationRequest request
    ) {
        ProjectInvitationResponse response = projectInvitationService.inviteProjectMember(projectId, request);
        return ApiResponse.created("프로젝트 멤버 초대 완료", response);
    }
}
