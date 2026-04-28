package com.a204.batang.domain.pin.service;

import com.a204.batang.domain.pin.dto.CreatePinCommentRequest;
import com.a204.batang.domain.pin.dto.CreatePinCommentResponse;
import com.a204.batang.domain.pin.dto.GetPinCommentsResponse;
import com.a204.batang.domain.pin.dto.PinCommentResponse;
import com.a204.batang.domain.pin.dto.UpdatePinCommentRequest;
import com.a204.batang.domain.pin.dto.UpdatePinCommentResponse;
import com.a204.batang.domain.pin.entity.PinCommentReadState;
import com.a204.batang.domain.pin.entity.ProjectPin;
import com.a204.batang.domain.pin.entity.ProjectPinComment;
import com.a204.batang.domain.pin.event.PinCommentCreatedEvent;
import com.a204.batang.domain.pin.repository.PinCommentReadStateRepository;
import com.a204.batang.domain.pin.repository.ProjectPinCommentRepository;
import com.a204.batang.domain.pin.repository.ProjectPinRepository;
import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
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
    private final EntityManager entityManager;
    private final ApplicationEventPublisher applicationEventPublisher;

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
        applicationEventPublisher.publishEvent(PinCommentCreatedEvent.from(projectId, pinId, savedComment));

        log.info("핀 댓글 등록 완료. projectId={}, pinId={}, commentId={}", projectId, pinId, savedComment.getCommentId());
        return CreatePinCommentResponse.from(savedComment, projectPin.getPinId());
    }

    /**
     * 핀 댓글 본문을 수정한다.
     * 읽음 상태(last_read_at)는 수정하지 않아 기존 읽음/안읽음 상태를 그대로 유지한다.
     *
     * @param projectId 프로젝트 ID
     * @param pinId 핀 ID
     * @param commentId 댓글 ID
     * @param request 댓글 수정 요청
     * @return 댓글 수정 응답
     */
    @Transactional
    public UpdatePinCommentResponse updateComment(
            UUID projectId,
            UUID pinId,
            UUID commentId,
            UpdatePinCommentRequest request
    ) {
        ProjectPinComment comment = getActiveCommentOrThrow(projectId, pinId, commentId);

        UUID currentUserId = projectAccessService.resolveCurrentUserId();
        projectAccessService.validateProjectPinWriterOrThrow(comment.getProjectPin().getProject(), currentUserId);
        validateCommentAuthorOrThrow(comment, currentUserId);

        String normalizedContent = request.content().trim();
        comment.updateContent(normalizedContent);
        entityManager.flush();

        log.info("핀 댓글 수정 완료. projectId={}, pinId={}, commentId={}", projectId, pinId, commentId);
        return UpdatePinCommentResponse.from(comment, pinId);
    }

    /**
     * 핀 댓글을 소프트 삭제한다.
     * 댓글 삭제 후 핀 댓글 요약(commentCount/lastCommentAt/lastCommentAuthorUserId)을 현재 상태로 갱신한다.
     *
     * @param projectId 프로젝트 ID
     * @param pinId 핀 ID
     * @param commentId 댓글 ID
     */
    @Transactional
    public void deleteComment(UUID projectId, UUID pinId, UUID commentId) {
        ProjectPinComment comment = getActiveCommentOrThrow(projectId, pinId, commentId);

        UUID currentUserId = projectAccessService.resolveCurrentUserId();
        ProjectPin projectPin = comment.getProjectPin();
        projectAccessService.validateProjectPinWriterOrThrow(projectPin.getProject(), currentUserId);
        validateCommentAuthorOrThrow(comment, currentUserId);

        comment.softDelete(LocalDateTime.now());
        refreshPinCommentSummaryAfterDelete(projectPin);

        log.info("핀 댓글 삭제 완료. projectId={}, pinId={}, commentId={}", projectId, pinId, commentId);
    }

    /**
     * 특정 핀의 댓글 목록을 페이지 단위로 조회한다.
     * GET API에서는 상태를 변경하지 않고 읽기 전용으로 처리한다.
     *
     * @param projectId 프로젝트 ID
     * @param pinId 핀 ID
     * @param page 1-base 페이지 번호
     * @param size 페이지 크기
     * @return 댓글 목록 응답
     */
    @Transactional(readOnly = true)
    public GetPinCommentsResponse getComments(UUID projectId, UUID pinId, int page, int size) {
        validatePaginationOrThrow(page, size);

        ProjectPin projectPin = getProjectPinOrThrow(projectId, pinId);

        UUID currentUserId = projectAccessService.resolveCurrentUserId();
        projectAccessService.validateProjectPinWriterOrThrow(projectPin.getProject(), currentUserId);

        Pageable pageable = PageRequest.of(
                page - 1,
                size,
                Sort.by(Sort.Direction.ASC, "createdAt")
        );
        Page<ProjectPinComment> commentPage = projectPinCommentRepository.findActiveCommentsByPinId(pinId, pageable);

        LocalDateTime lastReadAt = resolveLastReadAt(pinId, currentUserId);
        CommentUnreadSummary unreadSummary = resolveCommentUnreadSummary(pinId, currentUserId, lastReadAt);

        List<PinCommentResponse> commentResponses = commentPage.getContent().stream()
                .map(comment -> PinCommentResponse.from(
                        comment,
                        pinId,
                        projectPin.getStatus(),
                        currentUserId,
                        lastReadAt
                ))
                .toList();

        GetPinCommentsResponse response = GetPinCommentsResponse.of(
                pinId,
                unreadSummary.hasCommentByOtherUser(),
                unreadSummary.unreadCommentCount(),
                page,
                size,
                commentPage.getTotalElements(),
                commentPage.getTotalPages(),
                commentPage.hasNext(),
                commentResponses
        );

        log.info(
                "핀 댓글 목록 조회 완료. projectId={}, pinId={}, page={}, size={}, pageCount={}, totalCount={}, unreadCount={}",
                projectId,
                pinId,
                page,
                size,
                commentResponses.size(),
                commentPage.getTotalElements(),
                response.unreadCommentCount()
        );
        return response;
    }

    /**
     * 특정 핀의 댓글 목록을 읽음 처리한다.
     *
     * @param projectId 프로젝트 ID
     * @param pinId 핀 ID
     */
    @Transactional
    public void markCommentsAsRead(UUID projectId, UUID pinId) {
        ProjectPin projectPin = getProjectPinOrThrow(projectId, pinId);

        UUID currentUserId = projectAccessService.resolveCurrentUserId();
        projectAccessService.validateProjectPinWriterOrThrow(projectPin.getProject(), currentUserId);

        updateReadStateOnView(pinId, currentUserId);
        log.info("핀 댓글 읽음 처리 완료. projectId={}, pinId={}, userId={}", projectId, pinId, currentUserId);
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
     * 프로젝트/핀에 속한 활성 댓글을 조회한다.
     *
     * @param projectId 프로젝트 ID
     * @param pinId 핀 ID
     * @param commentId 댓글 ID
     * @return 조회된 댓글
     */
    private ProjectPinComment getActiveCommentOrThrow(UUID projectId, UUID pinId, UUID commentId) {
        return projectPinCommentRepository.findActiveCommentByProjectPin(projectId, pinId, commentId)
                .orElseThrow(() -> new CustomException(ErrorCode.COMMENT_NOT_FOUND));
    }

    /**
     * 댓글 수정/삭제 권한(작성자 본인 여부)을 검증한다.
     *
     * @param comment 댓글 엔티티
     * @param currentUserId 현재 사용자 ID
     */
    private void validateCommentAuthorOrThrow(ProjectPinComment comment, UUID currentUserId) {
        if (Objects.equals(comment.getAuthorUserId(), currentUserId)) {
            return;
        }

        throw new CustomException(ErrorCode.FORBIDDEN_ACCESS, "본인이 작성한 댓글만 수정하거나 삭제할 수 있습니다.");
    }

    /**
     * 댓글 삭제 이후 핀 댓글 요약 메타데이터를 갱신한다.
     *
     * @param projectPin 삭제 대상 댓글이 속한 핀
     */
    private void refreshPinCommentSummaryAfterDelete(ProjectPin projectPin) {
        UUID targetPinId = projectPin.getPinId();
        long activeCommentCount = projectPinCommentRepository.countByProjectPinPinIdAndDeletedAtIsNull(targetPinId);
        int totalCommentCount = Math.toIntExact(activeCommentCount + 1L);

        projectPinCommentRepository.findTopByProjectPinPinIdAndDeletedAtIsNullOrderByCreatedAtDescCommentIdDesc(targetPinId)
                .ifPresentOrElse(
                        latestComment -> projectPin.updateCommentSummary(
                                totalCommentCount,
                                latestComment.getCreatedAt(),
                                latestComment.getAuthorUserId()
                        ),
                        () -> projectPin.updateCommentSummary(
                                totalCommentCount,
                                projectPin.getCreatedAt(),
                                projectPin.getAuthorUserId()
                        )
                );
    }

    /**
     * 페이지 파라미터를 검증한다.
     *
     * @param page 페이지 번호(1-base)
     * @param size 페이지 크기
     */
    private void validatePaginationOrThrow(int page, int size) {
        if (page < 1) {
            throw new CustomException(ErrorCode.INVALID_REQUEST, "page는 1 이상이어야 합니다.");
        }
        if (size < 1) {
            throw new CustomException(ErrorCode.INVALID_REQUEST, "size는 1 이상이어야 합니다.");
        }
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
     * 사용자 기준 타인 댓글 집계 정보를 계산한다.
     *
     * @param pinId 핀 ID
     * @param currentUserId 현재 사용자 ID
     * @param lastReadAt 마지막 읽음 시각
     * @return 타인 댓글 집계 정보
     */
    private CommentUnreadSummary resolveCommentUnreadSummary(UUID pinId, UUID currentUserId, LocalDateTime lastReadAt) {
        if (currentUserId == null) {
            return new CommentUnreadSummary(false, 0);
        }

        long hasCommentCount = projectPinCommentRepository.countActiveOtherUserComments(pinId, currentUserId);
        if (hasCommentCount == 0L) {
            return new CommentUnreadSummary(false, 0);
        }

        long unreadCount = lastReadAt == null
                ? hasCommentCount
                : projectPinCommentRepository.countUnreadOtherUserComments(pinId, currentUserId, lastReadAt);

        return new CommentUnreadSummary(true, Math.toIntExact(unreadCount));
    }

    /**
     * 댓글 읽음 상태를 사용자별로 저장한다.
     *
     * @param pinId 핀 ID
     * @param currentUserId 현재 사용자 ID
     */
    private void updateReadStateOnView(UUID pinId, UUID currentUserId) {
        if (currentUserId == null) {
            return;
        }

        LocalDateTime now = LocalDateTime.now();
        pinCommentReadStateRepository.upsertLastReadState(
                pinId,
                currentUserId,
                null,
                now,
                now
        );
    }

    private record CommentUnreadSummary(boolean hasCommentByOtherUser, int unreadCommentCount) {
    }
}
