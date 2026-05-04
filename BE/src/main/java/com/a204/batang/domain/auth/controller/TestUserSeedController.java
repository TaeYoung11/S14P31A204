package com.a204.batang.domain.auth.controller;

import com.a204.batang.domain.auth.dto.response.SeedTestUsersResponse;
import com.a204.batang.domain.auth.service.TestUserSeedService;
import com.a204.batang.global.common.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 테스트 계정 시드 데이터를 생성하는 API를 제공한다.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/test/users")
public class TestUserSeedController {

    private final TestUserSeedService testUserSeedService;

    /**
     * 핀/댓글 테스트 편의를 위해 테스트 계정 6명을 생성한다.
     * 이메일 인증 절차를 우회해 native SQL로 직접 삽입한다.
     *
     * @return 시드 생성 결과
     */
    @PostMapping("/seed")
    public ApiResponse<SeedTestUsersResponse> seedUsers() {
        SeedTestUsersResponse response = testUserSeedService.seedUsers();
        return ApiResponse.success("테스트 계정 시드 생성이 완료되었습니다.", response);
    }
}
