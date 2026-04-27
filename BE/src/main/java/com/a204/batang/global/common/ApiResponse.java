package com.a204.batang.global.common;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;
import org.springframework.http.HttpStatus;

import java.time.OffsetDateTime;
import java.time.ZoneId;

@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class ApiResponse<T> {

    private static final ZoneId CURRENT_ZONE_ID = ZoneId.systemDefault();

    private final int status;
    private final String message;
    private final OffsetDateTime timestamp;
    private final T data;

    /**
     * 데이터가 있는 성공 응답 (기본 메시지: "성공")
     */
    public static <T> ApiResponse<T> success(T data) {
        return new ApiResponse<>(
                HttpStatus.OK.value(),
                "성공",
                currentTimestamp(),
                data
        );
    }

    /**
     * 커스텀 메시지와 데이터가 있는 성공 응답
     */
    public static <T> ApiResponse<T> success(String message, T data) {
        return new ApiResponse<>(
                HttpStatus.OK.value(),
                message,
                currentTimestamp(),
                data
        );
    }

    /**
     * 데이터가 없는 성공 응답 (예: 삭제, 단순 상태 변경 완료)
     */
    public static ApiResponse<Void> success(String message) {
        return new ApiResponse<>(
                HttpStatus.OK.value(),
                message,
                currentTimestamp(),
                null
        );
    }

    /**
     * 생성(201 Created) 성공 응답
     */
    public static <T> ApiResponse<T> created(String message, T data) {
        return new ApiResponse<>(
                HttpStatus.CREATED.value(),
                message,
                currentTimestamp(),
                data
        );
    }

    private static OffsetDateTime currentTimestamp() {
        return OffsetDateTime.now(CURRENT_ZONE_ID);
    }
}
