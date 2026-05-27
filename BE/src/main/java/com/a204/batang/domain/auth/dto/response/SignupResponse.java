package com.a204.batang.domain.auth.dto.response;

import com.a204.batang.domain.auth.entity.UserType;

import java.util.UUID;

/**
 * 회원가입 응답 DTO.
 *
 * @param userId 회원 ID
 * @param email 이메일
 * @param name 이름
 * @param userType 회원 유형
 * @param accessToken 발급된 Access Token
 * @param refreshToken 발급된 Refresh Token
 */
public record SignupResponse(
        UUID userId,
        String email,
        String name,
        UserType userType,
        String accessToken,
        String refreshToken
) {}
