package com.a204.batang.domain.project.dto;

import com.a204.batang.domain.auth.entity.Member;

import java.util.UUID;

/**
 * 프로젝트 참여자 정보를 표현한다.
 *
 * @param userId 사용자 ID
 * @param name 사용자 이름
 */
public record ProjectParticipantResponse(
        UUID userId,
        String name
) {

    /**
     * 사용자 엔티티를 참여자 응답 DTO로 변환한다.
     *
     * @param member 사용자 엔티티
     * @return 참여자 응답 DTO
     */
    public static ProjectParticipantResponse from(Member member) {
        return new ProjectParticipantResponse(member.getUserId(), member.getName());
    }

    /**
     * 사용자 ID와 이름으로 참여자 응답 DTO를 생성한다.
     *
     * @param userId 사용자 ID
     * @param name 사용자 이름
     * @return 참여자 응답 DTO
     */
    public static ProjectParticipantResponse of(UUID userId, String name) {
        return new ProjectParticipantResponse(userId, name);
    }
}
