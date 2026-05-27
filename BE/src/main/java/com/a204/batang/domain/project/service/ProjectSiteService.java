package com.a204.batang.domain.project.service;

import com.a204.batang.domain.project.dto.ProjectSiteResponse;
import com.a204.batang.domain.project.dto.RegisterProjectSiteRequest;
import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.repository.ProjectRepository;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * 프로젝트 대지정보 등록 유스케이스를 담당하는 서비스다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ProjectSiteService {

    private final ProjectRepository projectRepository;
    private final VworldService vworldService;
    private final ProjectAccessService projectAccessService;

    /**
     * 위경도를 기준으로 VWorld 지적도 정보를 조회하고 프로젝트 대지정보를 저장한다.
     *
     * @param projectId 프로젝트 ID
     * @param request 대지정보 등록 요청
     * @return 저장된 대지정보 응답
     */
    @Transactional
    public ProjectSiteResponse registerProjectSite(UUID projectId, RegisterProjectSiteRequest request) {
        projectAccessService.validateDesignerOrThrow();
        UUID currentUserId = projectAccessService.resolveCurrentUserIdOrThrow();

        Project project = projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)
                .orElseThrow(() -> new CustomException(ErrorCode.PROJECT_NOT_FOUND));
        projectAccessService.validateProjectOwnerOrThrow(project, currentUserId);

        VworldService.VworldSiteInfo vworldSiteInfo = vworldService.fetchProjectSiteInfo(
                projectId,
                request.latitude(),
                request.longitude(),
                null
        );

        try {
            project.applyCadastralInfo(
                    vworldSiteInfo.pnu(),
                    vworldSiteInfo.address(),
                    vworldSiteInfo.polygon().coordinates()
            );
        } catch (RuntimeException e) {
            log.warn("프로젝트 대지정보 반영 중 예외 발생. projectId={}", projectId, e);
            throw new CustomException(
                    ErrorCode.PROJECT_SITE_INFO_FETCH_FAILED,
                    "대지정보 저장 처리 중 오류가 발생했습니다."
            );
        }

        Project savedProject = projectRepository.save(project);
        log.info("대지정보 등록 완료. projectId={}", savedProject.getProjectId());
        return ProjectSiteResponse.from(savedProject, vworldSiteInfo.polygon());
    }
}
