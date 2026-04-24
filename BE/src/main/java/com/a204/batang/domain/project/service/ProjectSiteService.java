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

    /**
     * 위경도를 기준으로 VWorld 지적도 정보를 조회하고 프로젝트 대지정보를 저장한다.
     *
     * @param projectId 프로젝트 ID
     * @param request 대지정보 등록 요청
     * @return 저장된 대지정보 응답
     */
    @Transactional
    public ProjectSiteResponse registerProjectSite(UUID projectId, RegisterProjectSiteRequest request) {
        Project project = projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)
                .orElseThrow(() -> new CustomException(ErrorCode.PROJECT_NOT_FOUND));

        VworldService.VworldSiteInfo vworldSiteInfo = vworldService.fetchProjectSiteInfo(
                projectId,
                request.latitude(),
                request.longitude(),
                null
        );

        project.applyCadastralInfo(
                vworldSiteInfo.pnu(),
                vworldSiteInfo.address(),
                vworldSiteInfo.polygon().coordinates()
        );

        Project savedProject = projectRepository.save(project);
        log.info("대지정보 등록 완료. projectId={}", savedProject.getProjectId());
        return ProjectSiteResponse.from(savedProject, vworldSiteInfo.polygon());
    }
}
