package com.a204.batang.domain.auth.dto.response;

import com.a204.batang.domain.auth.entity.UserType;

import java.util.UUID;

/**
 * 회원 정보 응답 DTO.
 *
 * @param userId 회원 ID
 * @param email 이메일
 * @param name 이름
 * @param userType 회원 유형
 */
public record MemberInfoResponse(
        UUID userId,
        String email,
        String name,
        UserType userType
) {}
