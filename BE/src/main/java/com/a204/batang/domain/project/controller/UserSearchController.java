package com.a204.batang.domain.project.controller;

import com.a204.batang.domain.project.dto.UserSearchResponse;
import com.a204.batang.domain.project.service.UserSearchService;
import com.a204.batang.global.common.ApiResponse;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 프로젝트 초대용 사용자 검색 API를 제공한다.
 */
@Validated
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/users")
public class UserSearchController {

    private final UserSearchService userSearchService;

    /**
     * 이메일 기준으로 초대 가능한 사용자를 검색한다.
     *
     * @param email 이메일 검색어
     * @return 사용자 검색 결과 목록
     */
    @GetMapping("/search")
    public ApiResponse<List<UserSearchResponse>> searchUsers(
            @RequestParam @NotBlank(message = "email: 공백일 수 없습니다.") String email
    ) {
        List<UserSearchResponse> response = userSearchService.searchUsersByEmail(email);
        return ApiResponse.success("사용자 검색 성공", response);
    }
}
