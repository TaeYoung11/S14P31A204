package com.a204.batang.domain.pin.service;

import com.a204.batang.domain.pin.dto.CreatePinRequest;
import com.a204.batang.domain.pin.dto.CreatePinResponse;
import com.a204.batang.domain.pin.entity.ProjectPin;
import com.a204.batang.domain.pin.repository.ProjectPinRepository;
import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.repository.ProjectRepository;
import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * 프로젝트 핀 생성 유스케이스를 처리한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ProjectPinService {

    private final ProjectRepository projectRepository;
    private final ProjectPinRepository projectPinRepository;
    private final ProjectAccessService projectAccessService;

    /**
     * 프로젝트에 새 핀을 등록한다.
     *
     * @param projectId 프로젝트 ID
     * @param request 핀 생성 요청
     * @return 핀 생성 응답
     */
    @Transactional
    public CreatePinResponse createPin(UUID projectId, CreatePinRequest request) {
        Project project = projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)
                .orElseThrow(() -> new CustomException(ErrorCode.PROJECT_NOT_FOUND));

        UUID currentUserId = projectAccessService.resolveCurrentUserId();
        projectAccessService.validateProjectPinWriterOrThrow(project, currentUserId);

        String normalizedTargetElementId = request.targetElementId().trim();
        String normalizedContent = request.content().trim();

        ProjectPin projectPin = ProjectPin.create(
                project,
                currentUserId,
                request.cameraPosition().toPinPosition(),
                request.worldPosition().toPinPosition(),
                normalizedTargetElementId,
                normalizedContent
        );

        ProjectPin savedPin = projectPinRepository.save(projectPin);
        log.info("새 핀 등록 완료. projectId={}, pinId={}", projectId, savedPin.getPinId());

        return CreatePinResponse.from(savedPin);
    }
}
