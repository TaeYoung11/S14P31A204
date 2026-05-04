package com.a204.batang.domain.workspace.controller;

import com.a204.batang.domain.workspace.dto.BubbleUpdateRequest;
import com.a204.batang.domain.workspace.dto.FloorPlanRealtimeUpdateRequest;
import com.a204.batang.domain.workspace.service.WorkspaceFloorPlanRealtimeService;
import com.a204.batang.domain.workspace.service.WorkspaceRealtimeService;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.a204.batang.global.exception.ErrorResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageExceptionHandler;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.support.MethodArgumentNotValidException;
import org.springframework.messaging.simp.annotation.SendToUser;
import org.springframework.stereotype.Controller;
import org.springframework.validation.FieldError;

import java.security.Principal;
import java.util.Optional;
import java.util.UUID;

/**
 * 프로젝트 워크스페이스 STOMP 메시지 엔드포인트를 처리한다.
 */
@Controller
@RequiredArgsConstructor
public class WorkspaceStompController {

    private static final Logger log = LoggerFactory.getLogger(WorkspaceStompController.class);

    private final WorkspaceRealtimeService workspaceRealtimeService;
    private final WorkspaceFloorPlanRealtimeService workspaceFloorPlanRealtimeService;

    /**
     * 버블 다이어그램 편집 스냅샷을 동기화한다.
     * 클라이언트 발행 경로: /app/project/{projectId}/bubble/update
     *
     * @param projectId 프로젝트 ID
     * @param request 버블 스냅샷 요청
     * @param principal STOMP 인증 사용자
     */
    @MessageMapping("/project/{projectId}/bubble/update")
    public void updateBubble(
            @DestinationVariable UUID projectId,
            @Valid BubbleUpdateRequest request,
            Principal principal
    ) {
        UUID currentUserId = resolvePrincipalUserIdOrThrow(principal);
        workspaceRealtimeService.updateBubbleDraft(projectId, currentUserId, request);
    }

    /**
     * 2D/3D 편집 draft를 실시간 동기화한다.
     * 클라이언트 발행 경로: /app/project/{projectId}/floor-plan/update
     *
     * @param projectId 프로젝트 ID
     * @param request 2D/3D 실시간 편집 요청 payload
     * @param principal STOMP 인증 사용자
     */
    @MessageMapping("/project/{projectId}/floor-plan/update")
    public void updateFloorPlan(
            @DestinationVariable UUID projectId,
            @Valid FloorPlanRealtimeUpdateRequest request,
            Principal principal
    ) {
        UUID currentUserId = resolvePrincipalUserIdOrThrow(principal);
        workspaceFloorPlanRealtimeService.relayFloorPlanDraft(projectId, currentUserId, request);
    }

    /**
     * STOMP 메시지 처리 중 발생한 커스텀 예외를 사용자 에러 큐로 전달한다.
     *
     * @param exception 커스텀 예외
     * @return 에러 응답
     */
    @MessageExceptionHandler(CustomException.class)
    @SendToUser(value = "/queue/errors", broadcast = false)
    public ErrorResponse handleCustomException(CustomException exception) {
        ErrorCode errorCode = exception.getErrorCode();
        String message = Optional.ofNullable(exception.getMessage()).orElse(errorCode.getMessage());

        log.warn("STOMP CustomException - code: {}, message: {}", errorCode.getCode(), message);
        return buildErrorResponse(errorCode, message);
    }

    /**
     * STOMP payload Bean Validation 실패를 사용자 에러 큐로 전달한다.
     *
     * @param exception 검증 예외
     * @return 에러 응답
     */
    @MessageExceptionHandler(MethodArgumentNotValidException.class)
    @SendToUser(value = "/queue/errors", broadcast = false)
    public ErrorResponse handleValidationException(MethodArgumentNotValidException exception) {
        String message = Optional.ofNullable(exception.getBindingResult())
                .map(bindingResult -> bindingResult.getFieldError())
                .map(this::createFieldErrorMessage)
                .orElse(ErrorCode.INVALID_REQUEST.getMessage());

        log.warn("STOMP Validation Error: {}", message);
        return buildErrorResponse(ErrorCode.INVALID_REQUEST, message);
    }

    /**
     * STOMP 메시지 처리 중 발생한 예기치 못한 예외를 사용자 에러 큐로 전달한다.
     *
     * @param exception 예외
     * @return 에러 응답
     */
    @MessageExceptionHandler(Exception.class)
    @SendToUser(value = "/queue/errors", broadcast = false)
    public ErrorResponse handleGeneralException(Exception exception) {
        log.error("Unhandled STOMP exception", exception);
        return buildErrorResponse(ErrorCode.INTERNAL_SERVER_ERROR, ErrorCode.INTERNAL_SERVER_ERROR.getMessage());
    }

    private String createFieldErrorMessage(FieldError fieldError) {
        return String.format("%s: %s", fieldError.getField(), fieldError.getDefaultMessage());
    }

    private ErrorResponse buildErrorResponse(ErrorCode errorCode, String message) {
        return ErrorResponse.builder()
                .status(errorCode.getStatus().value())
                .code(errorCode.getCode())
                .message(message)
                .build();
    }

    private UUID resolvePrincipalUserIdOrThrow(Principal principal) {
        if (principal == null || principal.getName() == null || principal.getName().isBlank()) {
            throw new CustomException(ErrorCode.UNAUTHORIZED, "웹소켓 인증 정보가 없습니다.");
        }

        try {
            return UUID.fromString(principal.getName());
        } catch (IllegalArgumentException exception) {
            throw new CustomException(ErrorCode.UNAUTHORIZED, "웹소켓 인증 사용자 식별자가 올바르지 않습니다.");
        }
    }
}
