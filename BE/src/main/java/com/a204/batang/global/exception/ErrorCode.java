package com.a204.batang.global.exception;

import lombok.AllArgsConstructor;
import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
@AllArgsConstructor
public enum ErrorCode {

    // 공통 오류
    INTERNAL_SERVER_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "COMMON_INTERNAL_SERVER_ERROR", "서버 내부 오류가 발생했습니다."),
    INVALID_REQUEST(HttpStatus.BAD_REQUEST, "COMMON_INVALID_REQUEST", "잘못된 요청입니다."),
    FORBIDDEN_ACCESS(HttpStatus.FORBIDDEN, "COMMON_FORBIDDEN_ACCESS", "접근 권한이 없습니다."),

    // 사용자
    EXISTING_EMAIL(HttpStatus.CONFLICT, "USER_EXISTING_EMAIL", "이미 사용 중인 이메일입니다."),

    // 프로젝트
    PROJECT_NOT_FOUND(HttpStatus.NOT_FOUND, "PROJECT_NOT_FOUND", "프로젝트를 찾을 수 없습니다."),
    PROJECT_SITE_INFO_FETCH_FAILED(HttpStatus.BAD_GATEWAY, "PROJECT_SITE_INFO_FETCH_FAILED", "대지 정보 조회에 실패했습니다.");

    private final HttpStatus status;
    private final String code;
    private final String message;
}