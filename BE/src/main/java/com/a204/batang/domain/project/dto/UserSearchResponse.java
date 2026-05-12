package com.a204.batang.domain.project.dto;

import com.a204.batang.domain.auth.entity.Member;
import com.a204.batang.domain.auth.entity.UserType;

import java.util.UUID;

/**
 * 사용자 검색 결과 한 건을 표현하는 응답 DTO.
 *
 * @param userId 사용자 ID
 * @param name 사용자 이름
 * @param email 사용자 이메일
 * @param userType 사용자 계정 유형
 */
public record UserSearchResponse(
        UUID userId,
        String name,
        String email,
        UserType userType
) {

    /**
     * 회원 엔티티를 사용자 검색 응답 DTO로 변환한다.
     *
     * @param member 회원 엔티티
     * @return 사용자 검색 응답 DTO
     */
    public static UserSearchResponse from(Member member) {
        return new UserSearchResponse(
                member.getUserId(),
                member.getName(),
                member.getEmail(),
                member.getUserType()
        );
    }
}
