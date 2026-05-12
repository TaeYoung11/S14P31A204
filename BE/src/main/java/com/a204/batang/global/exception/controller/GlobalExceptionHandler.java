package com.a204.batang.global.exception.controller;

import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.a204.batang.global.exception.ErrorResponse;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.util.Optional;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    /**
     * DTO Bean Validation 실패를 처리한다.
     *
     * @param e MethodArgumentNotValidException
     * @return 400 에러 응답
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleMethodArgumentNotValidException(MethodArgumentNotValidException e) {
        String message = Optional.ofNullable(e.getBindingResult().getFieldError())
                .map(this::createFieldErrorMessage)
                .orElse(ErrorCode.INVALID_REQUEST.getMessage());

        log.warn("Validation Error: {}", message);
        return toResponse(ErrorCode.INVALID_REQUEST, message);
    }
    /**
     * 잘못된 인수 예외를 처리한다.
     *
     * @param e IllegalArgumentException
     * @return 400 에러 응답
     */
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ErrorResponse> handleIllegalArgumentException(IllegalArgumentException e) {
        log.warn("IllegalArgumentException: {}", e.getMessage());
        return toResponse(ErrorCode.INVALID_REQUEST, e.getMessage());
    }

    /**
     * 파라미터 검증 실패(예: @RequestParam, @PathVariable)를 처리한다.
     *
     * @param e ConstraintViolationException
     * @return 400 에러 응답
     */
    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ErrorResponse> handleConstraintViolationException(ConstraintViolationException e) {
        String message = e.getConstraintViolations()
                .stream()
                .findFirst()
                .map(ConstraintViolation::getMessage)
                .orElse(ErrorCode.INVALID_REQUEST.getMessage());

        log.warn("Constraint Violation: {}", message);
        return toResponse(ErrorCode.INVALID_REQUEST, message);
    }

    /**
     * 요청 바디 파싱 실패(JSON 문법 오류 등)를 처리한다.
     *
     * @param e HttpMessageNotReadableException
     * @return 400 에러 응답
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ErrorResponse> handleHttpMessageNotReadableException(HttpMessageNotReadableException e) {
        log.warn("HttpMessageNotReadableException: {}", e.getMessage());
        return toResponse(ErrorCode.INVALID_REQUEST, "요청 본문 형식이 올바르지 않습니다.");
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ErrorResponse> handleMissingServletRequestParameterException(
            MissingServletRequestParameterException e
    ) {
        String message = String.format("%s: 필수입니다.", e.getParameterName());
        log.warn("MissingServletRequestParameterException: {}", message);
        return toResponse(ErrorCode.INVALID_REQUEST, message);
    }

    /**
     * 타입 변환 실패(예: 숫자 파라미터에 문자열 전달)를 처리한다.
     *
     * @param e MethodArgumentTypeMismatchException
     * @return 400 에러 응답
     */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ErrorResponse> handleMethodArgumentTypeMismatchException(MethodArgumentTypeMismatchException e) {
        String message = String.format("요청 파라미터 '%s'의 형식이 올바르지 않습니다.", e.getName());
        log.warn("MethodArgumentTypeMismatchException: {}", message);
        return toResponse(ErrorCode.INVALID_REQUEST, message);
    }

    /**
     * NullPointerException 발생 시 처리한다.
     *
     * @param e NullPointerException
     * @return 500 에러 응답
     */
    @ExceptionHandler(NullPointerException.class)
    public ResponseEntity<ErrorResponse> handleNullPointerException(NullPointerException e) {
        log.error("NullPointerException 발생", e);
        return toResponse(ErrorCode.INTERNAL_SERVER_ERROR, "서버 내부에서 Null 참조 오류가 발생했습니다.");
    }

    /**
     * CustomException을 처리한다.
     *
     * @param e CustomException
     * @return 커스텀 에러 응답
     */
    @ExceptionHandler(CustomException.class)
    public ResponseEntity<ErrorResponse> handleCustomException(CustomException e) {
        ErrorCode errorCode = e.getErrorCode();
        String message = Optional.ofNullable(e.getMessage()).orElse(errorCode.getMessage());

        log.warn("CustomException - code: {}, message: {}", errorCode.getCode(), message);
        return toResponse(errorCode, message);
    }

    /**
     * DB unique constraint 위반을 처리한다.
     * uq_jobs_project_active_ifc_edit 위반은 IFC Edit 중복 작업으로 간주한다.
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ErrorResponse> handleDataIntegrityViolation(DataIntegrityViolationException e) {
        String msg = e.getMessage() != null ? e.getMessage() : "";
        if (msg.contains("uq_jobs_project_active_ifc_edit")) {
            log.warn("DataIntegrityViolationException - IFC Edit job conflict: {}", msg);
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(ErrorResponse.builder()
                            .status(HttpStatus.CONFLICT.value())
                            .code(ErrorCode.IFC_EDIT_JOB_CONFLICT.getCode())
                            .message(ErrorCode.IFC_EDIT_JOB_CONFLICT.getMessage())
                            .build());
        }
        log.warn("DataIntegrityViolationException: {}", msg);
        return toResponse(ErrorCode.CONCURRENT_MODIFICATION, ErrorCode.CONCURRENT_MODIFICATION.getMessage());
    }

    /**
     * 동시성 충돌(낙관적 락)을 처리한다.
     *
     * @param e ObjectOptimisticLockingFailureException
     * @return 409 에러 응답
     */
    @ExceptionHandler({ObjectOptimisticLockingFailureException.class, OptimisticLockingFailureException.class})
    public ResponseEntity<ErrorResponse> handleOptimisticLockingException(Exception e) {
        log.warn("OptimisticLockingFailureException: {}", e.getMessage());
        return toResponse(ErrorCode.CONCURRENT_MODIFICATION, ErrorCode.CONCURRENT_MODIFICATION.getMessage());
    }

    /**
     * 예상하지 못한 모든 예외를 처리한다.
     *
     * @param e Exception
     * @return 500 에러 응답
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGeneralException(Exception e) {
        log.error("Unhandled Exception 발생", e);
        return toResponse(ErrorCode.INTERNAL_SERVER_ERROR, ErrorCode.INTERNAL_SERVER_ERROR.getMessage());
    }

    private String createFieldErrorMessage(FieldError fieldError) {
        return String.format("%s: %s", fieldError.getField(), fieldError.getDefaultMessage());
    }

    private ResponseEntity<ErrorResponse> toResponse(ErrorCode errorCode, String message) {
        ErrorResponse response = ErrorResponse.builder()
                .status(errorCode.getStatus().value())
                .code(errorCode.getCode())
                .message(message)
                .build();
        return ResponseEntity.status(errorCode.getStatus()).body(response);
    }
}
