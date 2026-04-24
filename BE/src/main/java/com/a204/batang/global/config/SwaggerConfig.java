package com.a204.batang.global.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * OpenAPI(Swagger) 문서 기본 정보를 설정한다.
 */
@Configuration
public class SwaggerConfig {

    /**
     * Swagger UI에 노출할 기본 API 메타데이터를 구성한다.
     *
     * @return OpenAPI 객체
     */
    @Bean
    public OpenAPI openAPI() {

        // 추후 로그인 기능 추가 시 사용
        String jwtSchemeName = "jwtAuth";
        SecurityRequirement securityRequirement = new SecurityRequirement().addList(jwtSchemeName);
        Components components = new Components()
                .addSecuritySchemes(jwtSchemeName, new SecurityScheme()
                        .name(jwtSchemeName)
                        .type(SecurityScheme.Type.HTTP)
                        .scheme("bearer")
                        .bearerFormat("JWT"));

        Info info = new Info()
                .title("Batang API")
                .description("Batang 백엔드 API 문서")
                .version("v1.0.0");

        return new OpenAPI()
                .info(info)
                //.addSecurityItem(securityRequirement) // 추후 로그인 기능 추가 시 사용
                .components(components);
    }
}
