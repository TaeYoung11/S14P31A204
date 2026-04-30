package com.a204.batang.domain.auth.dto.response;

/**
 * 이메일 인증 코드 확인 응답 DTO.
 *
 * @param verifiedToken 회원가입 시 사용할 이메일 인증 토큰
 * @param expiresIn 만료 시간(초)
 */
public record VerifyEmailCodeResponse(
        String verifiedToken,
        int expiresIn
) {}
