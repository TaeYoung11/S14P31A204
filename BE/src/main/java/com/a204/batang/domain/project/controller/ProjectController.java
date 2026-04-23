package com.a204.batang.domain.project.controller;

import com.a204.batang.domain.project.dto.CreateProjectRequest;
import com.a204.batang.domain.project.dto.CreateProjectResponse;
import com.a204.batang.domain.project.dto.ProjectSiteResponse;
import com.a204.batang.domain.project.dto.RegisterProjectSiteRequest;
import com.a204.batang.domain.project.service.ProjectService;
import com.a204.batang.global.common.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * 프로젝트 생성/대지정보 입력 API를 제공하는 컨트롤러.
 */
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
            //Todo: 사용자 인증 추가
    ) {
        CreateProjectResponse response = projectService.createProject(request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created("프로젝트 생성 완료", response));
    }

    /**
     * 프로젝트에 대지 정보를 등록한다.
     *
     * @param projectId 프로젝트 ID
     * @param request 대지 정보 입력 요청
     * @return 대지 정보 등록 응답
     */
    @PostMapping("/{projectId}/site")
    public ApiResponse<ProjectSiteResponse> registerProjectSite(
            @PathVariable UUID projectId,
            @Valid @RequestBody RegisterProjectSiteRequest request
            //Todo: 사용자 인증 추가
    ) {
        ProjectSiteResponse response = projectService.registerProjectSite(projectId, request);
        return ApiResponse.success("대지정보 등록 완료", response);
    }
}