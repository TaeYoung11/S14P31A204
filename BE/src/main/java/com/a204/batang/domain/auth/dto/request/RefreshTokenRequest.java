package com.a204.batang.domain.auth.dto.request;

import jakarta.validation.constraints.NotBlank;

/**
 * 토큰 갱신 요청 DTO.
 *
 * @param refreshToken Refresh Token
 */
public record RefreshTokenRequest(
        @NotBlank(message = "Refresh Token은 필수입니다.")
        String refreshToken
) {}
