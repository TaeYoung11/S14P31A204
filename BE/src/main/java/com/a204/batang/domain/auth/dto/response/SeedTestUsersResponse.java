package com.a204.batang.domain.auth.dto.response;

import com.a204.batang.domain.auth.entity.UserType;

import java.util.List;

/**
 * 테스트용 계정 일괄 생성 결과 응답 DTO.
 *
 * @param totalRequested 생성 시도한 계정 수
 * @param createdCount 실제 생성된 계정 수
 * @param skippedCount 중복으로 건너뛴 계정 수
 * @param users 테스트 계정 목록
 */
public record SeedTestUsersResponse(
        int totalRequested,
        int createdCount,
        int skippedCount,
        List<SeededUser> users
) {

    /**
     * 테스트 계정 정보.
     *
     * @param email 이메일
     * @param password 테스트용 비밀번호(평문)
     * @param name 이름
     * @param userType 회원 유형
     */
    public record SeededUser(
            String email,
            String password,
            String name,
            UserType userType
    ) {
    }
}
