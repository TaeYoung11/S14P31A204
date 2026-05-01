package com.a204.batang.global.exception;

import lombok.AllArgsConstructor;
import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
@AllArgsConstructor
public enum ErrorCode {

    INTERNAL_SERVER_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "COMMON_INTERNAL_SERVER_ERROR", "서버 내부 오류가 발생했습니다."),
    INVALID_REQUEST(HttpStatus.BAD_REQUEST, "COMMON_INVALID_REQUEST", "잘못된 요청입니다."),
    UNAUTHORIZED(HttpStatus.UNAUTHORIZED, "COMMON_UNAUTHORIZED", "인증이 필요합니다."),
    FORBIDDEN_ACCESS(HttpStatus.FORBIDDEN, "COMMON_FORBIDDEN_ACCESS", "접근 권한이 없습니다."),
    TOO_MANY_REQUESTS(HttpStatus.TOO_MANY_REQUESTS, "COMMON_TOO_MANY_REQUESTS", "요청 횟수를 초과했습니다. 잠시 후 다시 시도해주세요."),
    CONCURRENT_MODIFICATION(HttpStatus.CONFLICT, "COMMON_CONCURRENT_MODIFICATION", "동시 수정 충돌이 발생했습니다. 화면을 새로고침 후 다시 시도해주세요."),

    EXISTING_EMAIL(HttpStatus.CONFLICT, "USER_EXISTING_EMAIL", "이미 사용 중인 이메일입니다."),

    PROJECT_NOT_FOUND(HttpStatus.NOT_FOUND, "PROJECT_NOT_FOUND", "프로젝트를 찾을 수 없습니다."),
    WORKSPACE_INVALID_PHASE(HttpStatus.CONFLICT, "WORKSPACE_INVALID_PHASE", "현재 워크스페이스 상태에서는 요청을 수행할 수 없습니다."),
    WORKSPACE_BUBBLE_SNAPSHOT_INVALID(HttpStatus.BAD_REQUEST, "WORKSPACE_BUBBLE_SNAPSHOT_INVALID", "버블 스냅샷 데이터 구조가 올바르지 않습니다."),
    WORKSPACE_BUBBLE_HISTORY_CURSOR_INVALID(HttpStatus.CONFLICT, "WORKSPACE_BUBBLE_HISTORY_CURSOR_INVALID", "Undo/Redo 기준 인덱스가 현재 히스토리와 일치하지 않습니다."),
    WORKSPACE_BUBBLE_CACHE_SAVE_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "WORKSPACE_BUBBLE_CACHE_SAVE_FAILED", "버블 스냅샷 Redis 저장에 실패했습니다."),
    PIN_NOT_FOUND(HttpStatus.NOT_FOUND, "PIN_NOT_FOUND", "핀을 찾을 수 없습니다."),
    COMMENT_NOT_FOUND(HttpStatus.NOT_FOUND, "COMMENT_NOT_FOUND", "댓글을 찾을 수 없습니다."),
    PROJECT_DELETE_TARGET_NOT_FOUND(HttpStatus.NOT_FOUND, "PROJECT_DELETE_TARGET_NOT_FOUND", "삭제 대상 프로젝트를 찾을 수 없습니다."),
    PROJECT_SITE_INFO_FETCH_FAILED(HttpStatus.BAD_GATEWAY, "PROJECT_SITE_INFO_FETCH_FAILED", "대지 정보를 가져오지 못했습니다."),
    RENDER_SOURCE_NOT_FOUND(HttpStatus.CONFLICT, "RENDER_SOURCE_NOT_FOUND", "렌더링할 IFC 모델이 없습니다."),
    RENDER_JOB_NOT_FOUND(HttpStatus.NOT_FOUND, "RENDER_JOB_NOT_FOUND", "렌더링 작업을 찾을 수 없습니다."),
    RENDER_STEP_NOT_FOUND(HttpStatus.NOT_FOUND, "RENDER_STEP_NOT_FOUND", "렌더링 작업 단계를 찾을 수 없습니다."),
    RENDER_EVENT_INVALID(HttpStatus.BAD_REQUEST, "RENDER_EVENT_INVALID", "렌더링 이벤트 메시지가 올바르지 않습니다."),
    RENDER_COMMAND_PUBLISH_FAILED(HttpStatus.BAD_GATEWAY, "RENDER_COMMAND_PUBLISH_FAILED", "렌더링 작업 요청 발행에 실패했습니다.");

    private final HttpStatus status;
    private final String code;
    private final String message;
}
