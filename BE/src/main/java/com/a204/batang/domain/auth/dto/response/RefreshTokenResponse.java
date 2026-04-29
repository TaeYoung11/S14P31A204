package com.a204.batang.domain.auth.dto.response;

/**
 * 토큰 갱신 응답 DTO.
 *
 * @param accessToken 새로 발급된 Access Token
 * @param refreshToken 새로 발급된 Refresh Token
 * @param accessTokenExpiresIn Access Token 만료 시간(초)
 * @param refreshTokenExpiresIn Refresh Token 만료 시간(초)
 */
public record RefreshTokenResponse(
        String accessToken,
        String refreshToken,
        int accessTokenExpiresIn,
        int refreshTokenExpiresIn
) {}
