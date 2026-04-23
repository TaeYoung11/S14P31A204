package com.a204.batang.domain.project.service;

import com.a204.batang.domain.project.dto.CadastralPolygonResponse;
import com.a204.batang.domain.project.dto.CreateProjectRequest;
import com.a204.batang.domain.project.dto.CreateProjectResponse;
import com.a204.batang.domain.project.dto.ProjectSiteResponse;
import com.a204.batang.domain.project.dto.RegisterProjectSiteRequest;
import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.infrastructure.VworldCadastralClient;
import com.a204.batang.domain.project.infrastructure.dto.VworldCadastralInfo;
import com.a204.batang.domain.project.repository.ProjectRepository;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.UUID;

/**
 * 프로젝트 생성과 대지 정보 등록을 처리하는 서비스이다.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class ProjectService {

    private final ProjectRepository projectRepository;
    private final VworldCadastralClient vworldCadastralClient;

    /**
     * 새 프로젝트를 생성한다.
     *
     * @param request 프로젝트 생성 요청
     * @return 생성된 프로젝트 응답
     */
    @Transactional
    public CreateProjectResponse createProject(CreateProjectRequest request) {
        String normalizedName = request.name().trim();
        String normalizedDescription = normalizeDescription(request.description());

        if (StringUtils.hasText(request.primaryClientId())) {
            log.info("primaryClientId 값은 현재 회원/권한 기능 전까지 저장하지 않습니다. primaryClientId={}",
                    request.primaryClientId());
        }

        Project project = Project.create(normalizedName, normalizedDescription);
        Project savedProject = projectRepository.save(project);

        log.info("프로젝트 생성 완료. projectId={}", savedProject.getProjectId());
        return CreateProjectResponse.from(savedProject);
    }

    /**
     * 프로젝트의 대지 정보를 등록한다.
     *
     * @param projectId 대상 프로젝트 ID
     * @param request 대지 정보 등록 요청
     * @return 대지 정보 등록 응답
     */
    @Transactional
    public ProjectSiteResponse registerProjectSite(UUID projectId, RegisterProjectSiteRequest request) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new CustomException(ErrorCode.PROJECT_NOT_FOUND));

        VworldCadastralInfo cadastralInfo = vworldCadastralClient.fetchByCoordinates(
                        request.latitude(),
                        request.longitude(),
                        null
                )
                .orElseThrow(() -> new CustomException(
                        ErrorCode.PROJECT_SITE_INFO_FETCH_FAILED,
                        "대지정보 조회에 실패했습니다. VWorld apiKey/Referer 설정을 확인해주세요."
                ));

        CadastralPolygonResponse polygon = CadastralPolygonResponse.fromRawGeometry(cadastralInfo.geometry());
        if (polygon == null) {
            log.warn("대지 geometry 변환 실패. projectId={}, pnu={}, address={}, geometryPreview={}",
                    projectId,
                    StringUtils.hasText(cadastralInfo.pnu()) ? cadastralInfo.pnu() : "(없음)",
                    StringUtils.hasText(cadastralInfo.address()) ? cadastralInfo.address() : "(없음)",
                    truncate(cadastralInfo.geometry(), 300));
            throw new CustomException(
                    ErrorCode.PROJECT_SITE_INFO_FETCH_FAILED,
                    "대지 geometry 변환에 실패했습니다."
            );
        }

        project.applyCadastralInfo(
                cadastralInfo.pnu(),
                cadastralInfo.address(),
                polygon.coordinates()
        );

        Project savedProject = projectRepository.save(project);
        log.info("대지정보 등록 완료. projectId={}", savedProject.getProjectId());
        return ProjectSiteResponse.from(savedProject, polygon);
    }

    /**
     * description 값을 null 또는 trim된 값으로 정규화한다.
     *
     * @param description 원본 description
     * @return 값이 없으면 null, 값이 있으면 trim 결과
     */
    private String normalizeDescription(String description) {
        if (!StringUtils.hasText(description)) {
            return null;
        }
        return description.trim();
    }

    private String truncate(String value, int maxLength) {
        if (!StringUtils.hasText(value) || value.length() <= maxLength) {
            return value;
        }
        return value.substring(0, maxLength) + "...";
    }
}