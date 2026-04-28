package com.a204.batang.global.exception;

import lombok.AllArgsConstructor;
import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
@AllArgsConstructor
public enum ErrorCode {

    INTERNAL_SERVER_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "COMMON_INTERNAL_SERVER_ERROR", "서버 내부 오류가 발생했습니다."),
    INVALID_REQUEST(HttpStatus.BAD_REQUEST, "COMMON_INVALID_REQUEST", "잘못된 요청입니다."),
    FORBIDDEN_ACCESS(HttpStatus.FORBIDDEN, "COMMON_FORBIDDEN_ACCESS", "접근 권한이 없습니다."),
    CONCURRENT_MODIFICATION(HttpStatus.CONFLICT, "COMMON_CONCURRENT_MODIFICATION", "동시 요청 충돌이 발생했습니다. 다시 시도해 주세요."),

    EXISTING_EMAIL(HttpStatus.CONFLICT, "USER_EXISTING_EMAIL", "이미 사용 중인 이메일입니다."),

    PROJECT_NOT_FOUND(HttpStatus.NOT_FOUND, "PROJECT_NOT_FOUND", "프로젝트를 찾을 수 없습니다."),
    PIN_NOT_FOUND(HttpStatus.NOT_FOUND, "PIN_NOT_FOUND", "핀을 찾을 수 없습니다."),
    COMMENT_NOT_FOUND(HttpStatus.NOT_FOUND, "COMMENT_NOT_FOUND", "댓글을 찾을 수 없습니다."),
    PROJECT_DELETE_TARGET_NOT_FOUND(HttpStatus.NOT_FOUND, "PROJECT_DELETE_TARGET_NOT_FOUND", "삭제 대상을 찾을 수 없습니다."),
    PROJECT_SITE_INFO_FETCH_FAILED(HttpStatus.BAD_GATEWAY, "PROJECT_SITE_INFO_FETCH_FAILED", "대지 정보를 가져오지 못했습니다.");

    private final HttpStatus status;
    private final String code;
    private final String message;
}
