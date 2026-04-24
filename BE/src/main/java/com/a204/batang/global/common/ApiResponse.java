package com.a204.batang.global.common;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class ApiResponse<T> {

    private final int status;
    private final String message;
    private final T data;

    /**
     * 데이터가 있는 성공 응답 (기본 메시지: "성공")
     */
    public static <T> ApiResponse<T> success(T data) {
        return new ApiResponse<>(HttpStatus.OK.value(), "성공", data);
    }

    /**
     * 커스텀 메시지와 데이터가 있는 성공 응답
     */
    public static <T> ApiResponse<T> success(String message, T data) {
        return new ApiResponse<>(HttpStatus.OK.value(), message, data);
    }

    /**
     * 데이터가 없는 성공 응답 (예: 삭제, 단순 상태 변경 완료)
     */
    public static ApiResponse<Void> success(String message) {
        return new ApiResponse<>(HttpStatus.OK.value(), message, null);
    }

    /**
     * 생성(201 Created) 성공 응답
     */
    public static <T> ApiResponse<T> created(String message, T data) {
        return new ApiResponse<>(HttpStatus.CREATED.value(), message, data);
    }
}
