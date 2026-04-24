package com.a204.batang.domain.project.service;

import com.a204.batang.domain.project.dto.CadastralPolygonResponse;
import com.a204.batang.domain.project.infrastructure.VworldCadastralClient;
import com.a204.batang.domain.project.infrastructure.dto.VworldCadastralInfo;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.UUID;

/**
 * VWorld 연동 로직(외부 API 호출 결과 검증/파싱)을 담당하는 서비스다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class VworldService {

    private final VworldCadastralClient vworldCadastralClient;

    /**
     * 좌표 기준으로 VWorld 지적도 정보를 조회하고 프로젝트에 적용 가능한 형태로 변환한다.
     *
     * @param projectId 프로젝트 ID(로그 추적용)
     * @param latitude 위도
     * @param longitude 경도
     * @param emdCd 읍면동 코드(선택)
     * @return 프로젝트 대지정보 등록용 결과
     */
    public VworldSiteInfo fetchProjectSiteInfo(UUID projectId, double latitude, double longitude, String emdCd) {
        VworldCadastralInfo cadastralInfo = vworldCadastralClient.fetchByCoordinates(latitude, longitude, emdCd)
                .orElseThrow(() -> new CustomException(
                        ErrorCode.PROJECT_SITE_INFO_FETCH_FAILED,
                        "대지정보 조회에 실패했습니다. VWorld apiKey/Referer 설정을 확인해 주세요."
                ));

        validateCadastralInfoOrThrow(projectId, cadastralInfo);
        CadastralPolygonResponse polygon = parsePolygonOrThrow(projectId, cadastralInfo);

        return new VworldSiteInfo(cadastralInfo.pnu(), cadastralInfo.address(), polygon);
    }

    /**
     * VWorld 응답 필수 필드(geometry, pnu/address) 존재 여부를 검증한다.
     *
     * @param projectId 프로젝트 ID
     * @param cadastralInfo VWorld 응답 정보
     */
    private void validateCadastralInfoOrThrow(UUID projectId, VworldCadastralInfo cadastralInfo) {
        if (!StringUtils.hasText(cadastralInfo.geometry())) {
            log.warn("VWorld 응답 geometry 누락. projectId={}, pnu={}, address={}",
                    projectId,
                    StringUtils.hasText(cadastralInfo.pnu()) ? cadastralInfo.pnu() : "(없음)",
                    StringUtils.hasText(cadastralInfo.address()) ? cadastralInfo.address() : "(없음)");
            throw new CustomException(ErrorCode.PROJECT_SITE_INFO_FETCH_FAILED, "VWorld 응답에 geometry 값이 없습니다.");
        }

        if (!StringUtils.hasText(cadastralInfo.pnu()) && !StringUtils.hasText(cadastralInfo.address())) {
            log.warn("VWorld 응답 pnu/address 누락. projectId={}, geometryPreview={}",
                    projectId,
                    truncate(cadastralInfo.geometry(), 200));
            throw new CustomException(ErrorCode.PROJECT_SITE_INFO_FETCH_FAILED, "VWorld 응답에 대지 식별 정보(pnu/address)가 없습니다.");
        }
    }

    /**
     * geometry 원문을 안전하게 파싱하고 유효한 좌표가 존재하는지 검증한다.
     * 파싱 중 RuntimeException이 발생해도 CustomException으로 변환해 일관된 에러 응답을 유지한다.
     *
     * @param projectId 프로젝트 ID
     * @param cadastralInfo VWorld 응답 정보
     * @return 파싱된 다각형 응답
     */
    private CadastralPolygonResponse parsePolygonOrThrow(UUID projectId, VworldCadastralInfo cadastralInfo) {
        final CadastralPolygonResponse polygon;
        try {
            polygon = CadastralPolygonResponse.fromRawGeometry(cadastralInfo.geometry());
        } catch (RuntimeException e) {
            log.warn("대지 geometry 파싱 예외 발생. projectId={}, pnu={}, geometryPreview={}",
                    projectId,
                    StringUtils.hasText(cadastralInfo.pnu()) ? cadastralInfo.pnu() : "(없음)",
                    truncate(cadastralInfo.geometry(), 300),
                    e);
            throw new CustomException(
                    ErrorCode.PROJECT_SITE_INFO_FETCH_FAILED,
                    "대지 geometry 파싱 중 오류가 발생했습니다."
            );
        }

        if (polygon == null || polygon.coordinates() == null || polygon.coordinates().isEmpty()) {
            log.warn("대지 geometry 변환 실패. projectId={}, pnu={}, address={}, geometryPreview={}",
                    projectId,
                    StringUtils.hasText(cadastralInfo.pnu()) ? cadastralInfo.pnu() : "(없음)",
                    StringUtils.hasText(cadastralInfo.address()) ? cadastralInfo.address() : "(없음)",
                    truncate(cadastralInfo.geometry(), 300));
            throw new CustomException(
                    ErrorCode.PROJECT_SITE_INFO_FETCH_FAILED,
                    "대지 geometry 변환 중 오류가 발생했습니다."
            );
        }

        return polygon;
    }

    private String truncate(String value, int maxLength) {
        if (!StringUtils.hasText(value) || value.length() <= maxLength) {
            return value;
        }
        return value.substring(0, maxLength) + "...";
    }

    /**
     * 프로젝트 대지정보 반영에 필요한 VWorld 조회 결과 모델.
     *
     * @param pnu 필지 고유번호
     * @param address 지번 주소
     * @param polygon 프런트 전달용 다각형 좌표
     */
    public record VworldSiteInfo(
            String pnu,
            String address,
            CadastralPolygonResponse polygon
    ) {
    }
}
