package com.a204.batang.domain.auth.dto.response;

import com.a204.batang.domain.auth.entity.UserType;

import java.util.UUID;

/**
 * 로그인 응답 DTO.
 *
 * @param accessToken 발급된 Access Token
 * @param refreshToken 발급된 Refresh Token
 * @param user 회원 정보
 */
public record LoginResponse(
        String accessToken,
        String refreshToken,
        UserInfo user
) {

    /**
     * 로그인 응답에 포함되는 회원 정보.
     *
     * @param userId 회원 ID
     * @param email 이메일
     * @param name 이름
     * @param userType 회원 유형
     */
    public record UserInfo(
            UUID userId,
            String email,
            String name,
            UserType userType
    ) {}
}
