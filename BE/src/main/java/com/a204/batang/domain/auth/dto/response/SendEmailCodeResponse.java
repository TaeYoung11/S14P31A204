package com.a204.batang.domain.auth.dto.response;

/**
 * 이메일 인증 코드 발송 응답 DTO.
 *
 * @param email 인증 코드를 발송한 이메일
 * @param expiresIn 만료 시간(초)
 */
public record SendEmailCodeResponse(
        String email,
        int expiresIn
) {}
