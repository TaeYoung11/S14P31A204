package com.a204.batang.domain.pin.service;

import com.a204.batang.domain.pin.dto.CreatePinRequest;
import com.a204.batang.domain.pin.dto.CreatePinResponse;
import com.a204.batang.domain.pin.dto.GetProjectPinsResponse;
import com.a204.batang.domain.pin.dto.ProjectPinResponse;
import com.a204.batang.domain.pin.dto.UpdatePinPositionRequest;
import com.a204.batang.domain.pin.dto.UpdatePinPositionResponse;
import com.a204.batang.domain.pin.entity.ProjectPin;
import com.a204.batang.domain.pin.entity.ProjectPinReadState;
import com.a204.batang.domain.pin.event.PinCreatedEvent;
import com.a204.batang.domain.pin.repository.ProjectPinCommentRepository;
import com.a204.batang.domain.pin.repository.ProjectPinReadStateRepository;
import com.a204.batang.domain.pin.repository.ProjectPinRepository;
import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.repository.ProjectRepository;
import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
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
import java.util.Set;
import java.util.UUID;

/**
 * 프로젝트 핀 생성/조회 유스케이스를 처리한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ProjectPinService {

    private static final LocalDateTime UNREAD_FALLBACK_AT = LocalDateTime.of(1970, 1, 1, 0, 0);

    private final ProjectRepository projectRepository;
    private final ProjectPinRepository projectPinRepository;
    private final ProjectPinCommentRepository projectPinCommentRepository;
    private final ProjectPinReadStateRepository projectPinReadStateRepository;
    private final ProjectAccessService projectAccessService;
    private final ApplicationEventPublisher applicationEventPublisher;

    /**
     * 프로젝트에 새 핀을 등록한다.
     *
     * @param projectId 프로젝트 ID
     * @param request 핀 생성 요청
     * @return 핀 생성 응답
     */
    @Transactional
    public CreatePinResponse createPin(UUID projectId, CreatePinRequest request) {
        Project project = getProjectOrThrow(projectId);

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
        applicationEventPublisher.publishEvent(PinCreatedEvent.from(projectId, savedPin));
        log.info("새 핀 등록 완료. projectId={}, pinId={}", projectId, savedPin.getPinId());

        return CreatePinResponse.from(savedPin);
    }

    /**
     * 프로젝트의 특정 핀 위치(카메라/월드 좌표)를 수정한다.
     *
     * @param projectId 프로젝트 ID
     * @param pinId 핀 ID
     * @param request 핀 위치 수정 요청
     * @return 핀 위치 수정 응답
     */
    @Transactional
    public UpdatePinPositionResponse updatePinPosition(UUID projectId, UUID pinId, UpdatePinPositionRequest request) {
        ProjectPin projectPin = getProjectPinOrThrow(projectId, pinId);

        UUID currentUserId = projectAccessService.resolveCurrentUserId();
        projectAccessService.validateProjectPinWriterOrThrow(projectPin.getProject(), currentUserId);
        validatePinAuthorOrThrow(projectPin, currentUserId);

        projectPin.updatePosition(
                request.cameraPosition().toPinPosition(),
                request.worldPosition().toPinPosition()
        );
        projectPinRepository.flush();

        log.info("핀 위치 수정 완료. projectId={}, pinId={}", projectId, pinId);
        return UpdatePinPositionResponse.from(projectPin);
    }

    /**
     * 프로젝트의 특정 핀을 소프트 삭제한다.
     * 핀 삭제 시 해당 핀의 활성 댓글도 함께 소프트 삭제한다.
     *
     * @param projectId 프로젝트 ID
     * @param pinId 핀 ID
     */
    @Transactional
    public void deletePin(UUID projectId, UUID pinId) {
        ProjectPin projectPin = getProjectPinOrThrow(projectId, pinId);

        UUID currentUserId = projectAccessService.resolveCurrentUserId();
        projectAccessService.validateProjectPinWriterOrThrow(projectPin.getProject(), currentUserId);
        validatePinAuthorOrThrow(projectPin, currentUserId);

        LocalDateTime deletedAt = LocalDateTime.now();
        projectPin.softDelete(deletedAt);
        int deletedCommentCount = projectPinCommentRepository.softDeleteByPinId(pinId, deletedAt);

        log.info(
                "핀 삭제 완료. projectId={}, pinId={}, deletedCommentCount={}",
                projectId,
                pinId,
                deletedCommentCount
        );
    }

    /**
     * 프로젝트의 핀 목록을 페이지 단위로 조회한다.
     * GET API에서는 상태를 변경하지 않고 읽기 전용으로 처리한다.
     *
     * @param projectId 프로젝트 ID
     * @param page 1-base 페이지 번호
     * @param size 페이지 크기
     * @return 핀 목록 응답
     */
    @Transactional(readOnly = true)
    public GetProjectPinsResponse getPins(UUID projectId, int page, int size) {
        validatePaginationOrThrow(page, size);

        Project project = getProjectOrThrow(projectId);
        UUID currentUserId = projectAccessService.resolveCurrentUserId();
        projectAccessService.validateProjectPinWriterOrThrow(project, currentUserId);

        Pageable pageable = PageRequest.of(
                page - 1,
                size,
                Sort.by(Sort.Direction.ASC, "createdAt")
        );
        Page<ProjectPin> pinPage = projectPinRepository.findActivePinsByProjectId(projectId, pageable);
        List<ProjectPin> pins = pinPage.getContent();

        LocalDateTime lastPinReadAt = resolveLastPinReadAt(projectId, currentUserId);
        PinUnreadSummary pinUnreadSummary = resolvePinUnreadSummary(projectId, currentUserId, lastPinReadAt);
        int unreadCommentPinCount = resolveUnreadCommentPinCount(projectId, currentUserId);
        Set<UUID> unreadCommentPinIds = resolveUnreadCommentPinIds(currentUserId, pins);

        List<ProjectPinResponse> pinResponses = pins.stream()
                .map(pin -> ProjectPinResponse.from(
                        pin,
                        currentUserId,
                        lastPinReadAt,
                        unreadCommentPinIds.contains(pin.getPinId())
                ))
                .toList();

        GetProjectPinsResponse response = GetProjectPinsResponse.of(
                projectId,
                pinUnreadSummary.hasPinByOtherUser(),
                pinUnreadSummary.unreadPinCount(),
                unreadCommentPinCount,
                page,
                size,
                pinPage.getTotalElements(),
                pinPage.getTotalPages(),
                pinPage.hasNext(),
                pinResponses
        );

        log.info(
                "핀 목록 조회 완료. projectId={}, page={}, size={}, pageCount={}, totalCount={}, unreadPinCount={}, unreadCommentPinCount={}",
                projectId,
                page,
                size,
                pinResponses.size(),
                pinPage.getTotalElements(),
                response.unreadPinCount(),
                response.unreadCommentPinCount()
        );
        return response;
    }

    /**
     * 프로젝트 핀 목록을 읽음 처리한다.
     *
     * @param projectId 프로젝트 ID
     */
    @Transactional
    public void markPinsAsRead(UUID projectId) {
        Project project = getProjectOrThrow(projectId);

        UUID currentUserId = projectAccessService.resolveCurrentUserId();
        projectAccessService.validateProjectPinWriterOrThrow(project, currentUserId);

        if (currentUserId == null) {
            return;
        }

        LocalDateTime now = LocalDateTime.now();
        projectPinReadStateRepository.upsertLastReadState(projectId, currentUserId, now, now);
        log.info("핀 목록 읽음 처리 완료. projectId={}, userId={}", projectId, currentUserId);
    }

    /**
     * 삭제되지 않은 프로젝트를 조회한다.
     *
     * @param projectId 프로젝트 ID
     * @return 프로젝트 엔티티
     */
    private Project getProjectOrThrow(UUID projectId) {
        return projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)
                .orElseThrow(() -> new CustomException(ErrorCode.PROJECT_NOT_FOUND));
    }

    /**
     * 프로젝트/핀에 해당하는 활성 핀을 조회한다.
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
     * 핀 수정/삭제 권한(작성자 본인 여부)을 검증한다.
     *
     * @param pin 핀 엔티티
     * @param currentUserId 현재 사용자 ID
     */
    private void validatePinAuthorOrThrow(ProjectPin pin, UUID currentUserId) {
        if (Objects.equals(pin.getAuthorUserId(), currentUserId)) {
            return;
        }

        throw new CustomException(ErrorCode.FORBIDDEN_ACCESS, "본인이 작성한 핀만 수정하거나 삭제할 수 있습니다.");
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
     * 사용자 기준 프로젝트 핀 목록 마지막 읽음 시각을 조회한다.
     *
     * @param projectId 프로젝트 ID
     * @param currentUserId 현재 사용자 ID
     * @return 마지막 읽음 시각
     */
    private LocalDateTime resolveLastPinReadAt(UUID projectId, UUID currentUserId) {
        if (currentUserId == null) {
            return null;
        }

        return projectPinReadStateRepository.findByProjectIdAndUserId(projectId, currentUserId)
                .map(ProjectPinReadState::getLastReadAt)
                .orElse(null);
    }

    /**
     * 사용자 기준 타인 핀 집계 정보를 계산한다.
     *
     * @param projectId 프로젝트 ID
     * @param currentUserId 현재 사용자 ID
     * @param lastPinReadAt 마지막 읽음 시각
     * @return 타인 핀 집계 정보
     */
    private PinUnreadSummary resolvePinUnreadSummary(UUID projectId, UUID currentUserId, LocalDateTime lastPinReadAt) {
        if (currentUserId == null) {
            return new PinUnreadSummary(false, 0);
        }

        long hasPinCount = projectPinRepository.countActiveOtherUserPins(projectId, currentUserId);
        if (hasPinCount == 0L) {
            return new PinUnreadSummary(false, 0);
        }

        long unreadCount = lastPinReadAt == null
                ? hasPinCount
                : projectPinRepository.countUnreadOtherUserPins(projectId, currentUserId, lastPinReadAt);

        return new PinUnreadSummary(true, Math.toIntExact(unreadCount));
    }

    /**
     * 사용자 기준 미확인 댓글이 달린 핀 개수를 조회한다.
     *
     * @param projectId 프로젝트 ID
     * @param currentUserId 현재 사용자 ID
     * @return 미확인 댓글이 달린 핀 개수
     */
    private int resolveUnreadCommentPinCount(UUID projectId, UUID currentUserId) {
        if (currentUserId == null) {
            return 0;
        }

        long count = projectPinCommentRepository.countUnreadCommentPins(
                projectId,
                currentUserId,
                UNREAD_FALLBACK_AT
        );
        return Math.toIntExact(count);
    }

    /**
     * 현재 페이지의 핀 중 사용자 기준 타인 미확인 댓글이 있는 핀 ID 집합을 조회한다.
     *
     * @param currentUserId 현재 사용자 ID
     * @param pins 페이지 핀 목록
     * @return 미확인 댓글이 있는 핀 ID 집합
     */
    private Set<UUID> resolveUnreadCommentPinIds(UUID currentUserId, List<ProjectPin> pins) {
        if (currentUserId == null || pins.isEmpty()) {
            return Set.of();
        }

        List<UUID> pinIds = pins.stream()
                .map(ProjectPin::getPinId)
                .toList();

        return Set.copyOf(projectPinCommentRepository.findUnreadCommentPinIdsByUser(
                pinIds,
                currentUserId,
                UNREAD_FALLBACK_AT
        ));
    }

    private record PinUnreadSummary(boolean hasPinByOtherUser, int unreadPinCount) {
    }
}
