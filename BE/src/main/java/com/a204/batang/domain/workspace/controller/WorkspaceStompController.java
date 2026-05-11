package com.a204.batang.domain.workspace.controller;

import com.a204.batang.domain.ifcedit.dto.ChatCommandRequest;
import com.a204.batang.domain.ifcedit.dto.IfcEditJobResponse;
import com.a204.batang.domain.ifcedit.service.ChatCommandService;
import com.a204.batang.domain.workspace.dto.BubbleRedoRequest;
import com.a204.batang.domain.workspace.dto.BubbleUndoRequest;
import com.a204.batang.domain.workspace.dto.BubbleUpdateRequest;
import com.a204.batang.domain.workspace.dto.FloorPlanRealtimeUpdateRequest;
import com.a204.batang.domain.workspace.dto.FloorPlanRedoRequest;
import com.a204.batang.domain.workspace.dto.FloorPlanUndoRequest;
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
 * 워크스페이스 실시간 편집 STOMP 엔드포인트를 제공한다.
 */
@Controller
@RequiredArgsConstructor
public class WorkspaceStompController {

    private static final Logger log = LoggerFactory.getLogger(WorkspaceStompController.class);

    private final ChatCommandService chatCommandService;
    private final WorkspaceRealtimeService workspaceRealtimeService;
    private final WorkspaceFloorPlanRealtimeService workspaceFloorPlanRealtimeService;

    /**
     * 채팅 기반 편집 요청을 websocket으로 받아 ifcedit 작업을 큐에 등록한다.
     *
     * @param projectId 프로젝트 ID
     * @param request 채팅 편집 요청 payload
     * @param principal STOMP 인증 사용자
     * @return 등록된 ifcedit job 정보
     */
    @MessageMapping("/project/{projectId}/chat/command")
    @SendToUser(value = "/queue/chat/accepted", broadcast = false)
    public IfcEditJobResponse createChatCommand(
            @DestinationVariable UUID projectId,
            @Valid ChatCommandRequest request,
            Principal principal
    ) {
        UUID currentUserId = resolvePrincipalUserIdOrThrow(principal);
        return chatCommandService.createChatCommand(projectId, currentUserId, request);
    }

    /**
     * 버블 다이어그램 업데이트 이벤트를 전달한다.
     *
     * @param projectId 프로젝트 ID
     * @param request 버블 업데이트 payload
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
     * 버블 다이어그램 Undo를 요청한다.
     *
     * @param projectId 프로젝트 ID
     * @param request Undo payload
     * @param principal STOMP 인증 사용자
     */
    @MessageMapping("/project/{projectId}/bubble/undo")
    public void undoBubble(
            @DestinationVariable UUID projectId,
            @Valid BubbleUndoRequest request,
            Principal principal
    ) {
        UUID currentUserId = resolvePrincipalUserIdOrThrow(principal);
        workspaceRealtimeService.undoBubbleDraft(projectId, currentUserId, request);
    }

    /**
     * 버블 다이어그램 Redo를 요청한다.
     *
     * @param projectId 프로젝트 ID
     * @param request Redo payload
     * @param principal STOMP 인증 사용자
     */
    @MessageMapping("/project/{projectId}/bubble/redo")
    public void redoBubble(
            @DestinationVariable UUID projectId,
            @Valid BubbleRedoRequest request,
            Principal principal
    ) {
        UUID currentUserId = resolvePrincipalUserIdOrThrow(principal);
        workspaceRealtimeService.redoBubbleDraft(projectId, currentUserId, request);
    }

    /**
     * 2D/3D 화면 draft 이벤트를 전달한다.
     *
     * @param projectId 프로젝트 ID
     * @param request 화면 업데이트 payload
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
     * 2D/3D 화면 Undo를 요청한다.
     *
     * @param projectId 프로젝트 ID
     * @param request Undo payload
     * @param principal STOMP 인증 사용자
     */
    @MessageMapping("/project/{projectId}/floor-plan/undo")
    public void undoFloorPlan(
            @DestinationVariable UUID projectId,
            @Valid FloorPlanUndoRequest request,
            Principal principal
    ) {
        UUID currentUserId = resolvePrincipalUserIdOrThrow(principal);
        workspaceFloorPlanRealtimeService.undoFloorPlanDraft(projectId, currentUserId, request);
    }

    /**
     * 2D/3D 화면 Redo를 요청한다.
     *
     * @param projectId 프로젝트 ID
     * @param request Redo payload
     * @param principal STOMP 인증 사용자
     */
    @MessageMapping("/project/{projectId}/floor-plan/redo")
    public void redoFloorPlan(
            @DestinationVariable UUID projectId,
            @Valid FloorPlanRedoRequest request,
            Principal principal
    ) {
        UUID currentUserId = resolvePrincipalUserIdOrThrow(principal);
        workspaceFloorPlanRealtimeService.redoFloorPlanDraft(projectId, currentUserId, request);
    }

    /**
     * 도메인 커스텀 예외를 사용자 개인 에러 채널로 전송한다.
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
     * STOMP payload 검증 실패 예외를 처리한다.
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
     * 처리되지 않은 예외를 공통 내부 서버 에러 응답으로 변환한다.
     *
     * @param exception 미처리 예외
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
            throw new CustomException(ErrorCode.UNAUTHORIZED, "인증 사용자 정보를 찾을 수 없습니다.");
        }

        try {
            return UUID.fromString(principal.getName());
        } catch (IllegalArgumentException exception) {
            throw new CustomException(ErrorCode.UNAUTHORIZED, "인증 사용자 ID 형식이 올바르지 않습니다.");
        }
    }
}
