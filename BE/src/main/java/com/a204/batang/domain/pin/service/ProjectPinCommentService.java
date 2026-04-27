package com.a204.batang.domain.pin.service;

import com.a204.batang.domain.pin.dto.CreatePinCommentRequest;
import com.a204.batang.domain.pin.dto.CreatePinCommentResponse;
import com.a204.batang.domain.pin.entity.ProjectPin;
import com.a204.batang.domain.pin.entity.ProjectPinComment;
import com.a204.batang.domain.pin.repository.ProjectPinCommentRepository;
import com.a204.batang.domain.pin.repository.ProjectPinRepository;
import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * 핀 댓글 생성 유스케이스를 처리한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ProjectPinCommentService {

    private final ProjectPinRepository projectPinRepository;
    private final ProjectPinCommentRepository projectPinCommentRepository;
    private final ProjectAccessService projectAccessService;

    /**
     * 핀에 댓글을 등록한다.
     *
     * @param projectId 프로젝트 ID
     * @param pinId 핀 ID
     * @param request 댓글 생성 요청
     * @return 댓글 생성 응답
     */
    @Transactional
    public CreatePinCommentResponse createComment(UUID projectId, UUID pinId, CreatePinCommentRequest request) {
        ProjectPin projectPin = getProjectPinOrThrow(projectId, pinId);

        UUID currentUserId = projectAccessService.resolveCurrentUserId();
        projectAccessService.validateProjectPinWriterOrThrow(projectPin.getProject(), currentUserId);

        String normalizedContent = request.content().trim();
        ProjectPinComment projectPinComment = ProjectPinComment.create(projectPin, currentUserId, normalizedContent);
        ProjectPinComment savedComment = projectPinCommentRepository.save(projectPinComment);

        projectPin.recordComment(currentUserId);

        log.info("핀 댓글 등록 완료. projectId={}, pinId={}, commentId={}", projectId, pinId, savedComment.getCommentId());
        return CreatePinCommentResponse.from(savedComment);
    }

    /**
     * 프로젝트에 속한 활성 핀을 조회한다.
     *
     * @param projectId 프로젝트 ID
     * @param pinId 핀 ID
     * @return 조회된 핀
     */
    private ProjectPin getProjectPinOrThrow(UUID projectId, UUID pinId) {
        return projectPinRepository.findByPinIdAndProject_ProjectIdAndDeletedAtIsNull(pinId, projectId)
                .orElseThrow(() -> new CustomException(ErrorCode.PIN_NOT_FOUND));
    }
}
