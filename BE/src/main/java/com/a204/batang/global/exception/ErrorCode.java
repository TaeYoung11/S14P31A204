package com.a204.batang.global.exception;


import lombok.AllArgsConstructor;
import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
@AllArgsConstructor
public enum ErrorCode {

    // 공통 예외
    INTERNAL_SERVER_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "COMMON_INTERNAL_SERVER_ERROR", "서버에 문제가 발생했습니다."),
    INVALID_REQUEST(HttpStatus.BAD_REQUEST, "COMMON_INVALID_REQUEST", "잘못된 요청입니다."),
    FORBIDDEN_ACCESS(HttpStatus.FORBIDDEN, "COMMON_FORBIDDEN_ACCESS", "접근 권한이 없습니다."),

    // 사용자 예외
    EXISTING_EMAIL(HttpStatus.CONFLICT, "USER_EXISTING_EMAIL", "이미 존재하는 이메일입니다.");


    private final HttpStatus status;
    private final String code;
    private final String message;
}
