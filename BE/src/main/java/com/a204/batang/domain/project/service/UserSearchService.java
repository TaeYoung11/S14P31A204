package com.a204.batang.domain.project.service;

import com.a204.batang.domain.auth.entity.UserStatus;
import com.a204.batang.domain.auth.repository.MemberRepository;
import com.a204.batang.domain.project.dto.UserSearchResponse;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.UUID;

/**
 * 초대 대상 사용자 검색을 처리하는 서비스.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class UserSearchService {

    private static final int MAX_SEARCH_RESULTS = 10;

    private final MemberRepository memberRepository;
    private final ProjectAccessService projectAccessService;

    /**
     * 이메일 기준으로 초대 가능한 사용자를 검색한다.
     *
     * @param email 검색어로 사용할 이메일 문자열
     * @return 검색 결과 목록
     */
    public List<UserSearchResponse> searchUsersByEmail(String email) {
        if (!StringUtils.hasText(email)) {
            throw new CustomException(ErrorCode.INVALID_REQUEST, "email: 공백일 수 없습니다.");
        }

        UUID currentUserId = projectAccessService.resolveCurrentUserIdOrThrow();
        String trimmedEmail = email.trim();
        Pageable pageable = PageRequest.of(0, MAX_SEARCH_RESULTS);

        return memberRepository.searchActiveMembersByEmailKeywordExcludingCurrentUser(
                        trimmedEmail,
                        UserStatus.ACTIVE,
                        currentUserId,
                        pageable
                ).stream()
                .map(UserSearchResponse::from)
                .toList();
    }
}
