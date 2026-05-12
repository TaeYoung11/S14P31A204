package com.a204.batang.domain.project.controller;

import com.a204.batang.domain.auth.entity.UserType;
import com.a204.batang.domain.project.dto.UserSearchResponse;
import com.a204.batang.domain.project.service.UserSearchService;
import com.a204.batang.global.exception.controller.GlobalExceptionHandler;
import com.a204.batang.global.jwt.JwtAuthFilter;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.jpa.mapping.JpaMetamodelMappingContext;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.UUID;

import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(UserSearchController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class UserSearchControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private UserSearchService userSearchService;

    @MockitoBean
    private JpaMetamodelMappingContext jpaMetamodelMappingContext;

    @MockitoBean
    private JwtAuthFilter jwtAuthFilter;

    @Test
    void searchUsers_returnsWrappedResponse() throws Exception {
        UUID userId = UUID.randomUUID();
        // service가 반환한 검색 결과가 ApiResponse 규약으로 감싸지는지 확인한다.
        given(userSearchService.searchUsersByEmail("kim"))
                .willReturn(List.of(new UserSearchResponse(
                        userId,
                        "김건우",
                        "kim@example.com",
                        UserType.CUSTOMER
                )));

        mockMvc.perform(get("/api/v1/users/search")
                        .param("email", "kim"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(200))
                .andExpect(jsonPath("$.message").value("사용자 검색 성공"))
                .andExpect(jsonPath("$.data[0].userId").value(userId.toString()))
                .andExpect(jsonPath("$.data[0].name").value("김건우"))
                .andExpect(jsonPath("$.data[0].email").value("kim@example.com"))
                .andExpect(jsonPath("$.data[0].userType").value("CUSTOMER"));
    }

    @Test
    void searchUsers_returnsBadRequestWhenEmailIsBlank() throws Exception {
        // query parameter 검증 실패는 controller 레벨에서 400으로 반환되어야 한다.
        mockMvc.perform(get("/api/v1/users/search")
                        .param("email", " "))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.code").value("COMMON_INVALID_REQUEST"))
                .andExpect(jsonPath("$.message").value("email: 공백일 수 없습니다."));
    }
}
