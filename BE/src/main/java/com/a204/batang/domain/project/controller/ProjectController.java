package com.a204.batang.domain.project.controller;

import com.a204.batang.domain.project.dto.CreateProjectRequest;
import com.a204.batang.domain.project.dto.CreateProjectResponse;
import com.a204.batang.domain.project.dto.ProjectListResponse;
import com.a204.batang.domain.project.dto.ProjectSiteResponse;
import com.a204.batang.domain.project.dto.RegisterProjectSiteRequest;
import com.a204.batang.domain.project.service.ProjectService;
import com.a204.batang.global.common.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * 프로젝트 생성/목록 조회/대지정보 등록 API를 제공하는 컨트롤러이다.
 */
@Validated
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/projects")
public class ProjectController {

    private final ProjectService projectService;

    /**
     * 새 프로젝트를 생성한다.
     *
     * @param request 프로젝트 생성 요청
     * @return 프로젝트 생성 응답
     */
    @PostMapping
    public ResponseEntity<ApiResponse<CreateProjectResponse>> createProject(
            @Valid @RequestBody CreateProjectRequest request
            // TODO: 회원 기능 도입 후 인증 사용자 정보 주입
    ) {
        CreateProjectResponse response = projectService.createProject(request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created("프로젝트 생성 완료", response));
    }

    /**
     * 로그인 사용자의 프로젝트 목록을 조회한다.
     * 회원 기능 미구현 상태에서는 ownerUserId가 null인 프로젝트를 조회한다.
     *
     * @param page 1-base 페이지 번호
     * @return 프로젝트 목록 조회 응답
     */
    @GetMapping
    public ApiResponse<ProjectListResponse> getMyProjects(
            @RequestParam(defaultValue = "1") @Min(value = 1, message = "page는 1 이상이어야 합니다.") int page
            // TODO: 회원 기능 도입 후 @AuthenticationPrincipal로 사용자 ID 전달
    ) {
        ProjectListResponse response = projectService.getMyProjects(page);
        return ApiResponse.success("프로젝트 목록 조회 성공", response);
    }

    /**
     * 프로젝트의 대지정보를 등록한다.
     *
     * @param projectId 프로젝트 ID
     * @param request 대지정보 등록 요청
     * @return 대지정보 등록 응답
     */
    @PostMapping("/{projectId}/site")
    public ApiResponse<ProjectSiteResponse> registerProjectSite(
            @PathVariable UUID projectId,
            @Valid @RequestBody RegisterProjectSiteRequest request
            // TODO: 회원 기능 도입 후 인증 사용자 정보 주입
    ) {
        ProjectSiteResponse response = projectService.registerProjectSite(projectId, request);
        return ApiResponse.success("대지정보 등록 완료", response);
    }
}