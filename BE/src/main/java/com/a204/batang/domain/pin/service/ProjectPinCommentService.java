package com.a204.batang.domain.pin.service;

import com.a204.batang.domain.pin.dto.CreatePinCommentRequest;
import com.a204.batang.domain.pin.dto.CreatePinCommentResponse;
import com.a204.batang.domain.pin.dto.GetPinCommentsResponse;
import com.a204.batang.domain.pin.dto.PinCommentResponse;
import com.a204.batang.domain.pin.entity.PinCommentReadState;
import com.a204.batang.domain.pin.entity.ProjectPin;
import com.a204.batang.domain.pin.entity.ProjectPinComment;
import com.a204.batang.domain.pin.repository.PinCommentReadStateRepository;
import com.a204.batang.domain.pin.repository.ProjectPinCommentRepository;
import com.a204.batang.domain.pin.repository.ProjectPinRepository;
import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 핀 댓글 생성/조회 유스케이스를 처리한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ProjectPinCommentService {

    private final ProjectPinRepository projectPinRepository;
    private final ProjectPinCommentRepository projectPinCommentRepository;
    private final PinCommentReadStateRepository pinCommentReadStateRepository;
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
        return CreatePinCommentResponse.from(savedComment, projectPin.getPinId());
    }

    /**
     * 핀 댓글 목록을 조회하고 사용자별 읽음 상태를 갱신한다.
     * 사용자 기능이 아직 없는 단계(currentUserId == null)에서는 읽음 상태 갱신을 건너뛴다.
     *
     * @param projectId 프로젝트 ID
     * @param pinId 핀 ID
     * @return 댓글 목록 응답
     */
    @Transactional
    public GetPinCommentsResponse getComments(UUID projectId, UUID pinId) {
        ProjectPin projectPin = getProjectPinOrThrow(projectId, pinId);

        UUID currentUserId = projectAccessService.resolveCurrentUserId();
        projectAccessService.validateProjectPinWriterOrThrow(projectPin.getProject(), currentUserId);

        List<ProjectPinComment> comments = projectPinCommentRepository
                .findActiveCommentsByPinId(pinId);

        LocalDateTime lastReadAt = resolveLastReadAt(pinId, currentUserId);
        List<PinCommentResponse> commentResponses = comments.stream()
                .map(comment -> PinCommentResponse.from(
                        comment,
                        pinId,
                        projectPin.getStatus(),
                        currentUserId,
                        lastReadAt
                ))
                .toList();

        GetPinCommentsResponse response = GetPinCommentsResponse.of(pinId, commentResponses);
        updateReadStateOnView(pinId, currentUserId, comments);

        log.info(
                "핀 댓글 목록 조회 완료. projectId={}, pinId={}, count={}, unreadCount={}",
                projectId,
                pinId,
                commentResponses.size(),
                response.unreadCommentCount()
        );
        return response;
    }

    /**
     * 프로젝트에 속한 활성 핀을 조회한다.
     *
     * @param projectId 프로젝트 ID
     * @param pinId 핀 ID
     * @return 조회된 핀
     */
    private ProjectPin getProjectPinOrThrow(UUID projectId, UUID pinId) {
        return projectPinRepository.findActivePinByProjectId(pinId, projectId)
                .orElseThrow(() -> new CustomException(ErrorCode.PIN_NOT_FOUND));
    }

    /**
     * 사용자별 마지막 읽음 시각을 조회한다.
     *
     * @param pinId 핀 ID
     * @param currentUserId 현재 사용자 ID
     * @return 마지막 읽음 시각
     */
    private LocalDateTime resolveLastReadAt(UUID pinId, UUID currentUserId) {
        if (currentUserId == null) {
            return null;
        }
        return pinCommentReadStateRepository.findByPinIdAndUserId(pinId, currentUserId)
                .map(PinCommentReadState::getLastReadAt)
                .orElse(null);
    }

    /**
     * 댓글 목록 조회 이후 읽음 상태를 최신 시각으로 저장한다.
     * 조회를 읽음 행위로 간주하며, 사용자별로 독립 관리한다.
     *
     * @param pinId 핀 ID
     * @param currentUserId 현재 사용자 ID
     * @param comments 조회된 댓글 목록
     */
    private void updateReadStateOnView(UUID pinId, UUID currentUserId, List<ProjectPinComment> comments) {
        if (currentUserId == null) {
            return;
        }

        UUID lastReadCommentId = comments.isEmpty() ? null : comments.get(comments.size() - 1).getCommentId();
        LocalDateTime now = LocalDateTime.now();
        pinCommentReadStateRepository.upsertLastReadState(
                pinId,
                currentUserId,
                lastReadCommentId,
                now,
                now
        );
    }
}
