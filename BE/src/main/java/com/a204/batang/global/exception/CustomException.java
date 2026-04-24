package com.a204.batang.global.exception;

import lombok.Getter;

@Getter
public class CustomException extends RuntimeException {

    private final ErrorCode errorCode;

    /**
     * ErrorCode의 기본 메시지를 사용하는 커스텀 예외를 생성한다.
     *
     * @param errorCode 에러 코드
     */
    public CustomException(ErrorCode errorCode) {
        super(errorCode.getMessage());
        this.errorCode = errorCode;
    }

    /**
     * ErrorCode와 별도 메시지를 함께 사용하는 커스텀 예외를 생성한다.
     *
     * @param errorCode 에러 코드
     * @param message 예외 메시지
     */
    public CustomException(ErrorCode errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
    }
}
