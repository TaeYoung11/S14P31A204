package com.a204.batang.domain.project.infrastructure;

import com.a204.batang.domain.project.infrastructure.dto.VworldCadastralInfo;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Iterator;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * VWorld API를 호출해 좌표 기반 지적도 정보를 조회한다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class VworldCadastralClient {

    private static final Pattern EMD_CD_PATTERN = Pattern.compile("^\\d{6,10}$");

    private final WebClient.Builder webClientBuilder;

    @Value("${VWORLD_API_KEY:}")
    private String apiKey;

    @Value("${VWORLD_BASE_URL:https://apis.vworld.kr}")
    private String baseUrl;

    @Value("${VWORLD_CADASTRAL_PATH:/2ddata/cadastral/data}")
    private String cadastralPath;

    @Value("${VWORLD_REFERER:}")
    private String referer;

    @Value("${VWORLD_OUTPUT:json}")
    private String output;

    @Value("${VWORLD_SRS_NAME:EPSG:4326}")
    private String srsName;

    @Value("${VWORLD_PROPERTY_NAME:pnu,jibun,bonbun,bubun,ag_geom,addr}")
    private String propertyName;

    @Value("${VWORLD_BUFFER:10}")
    private int buffer;

    @Value("${VWORLD_PAGE_INDEX:1}")
    private int pageIndex;

    @Value("${VWORLD_PAGE_UNIT:10}")
    private int pageUnit;

    @Value("${VWORLD_TIMEOUT_SECONDS:3}")
    private long timeoutSeconds;

    /**
     * 위경도를 기준으로 VWorld 지적도 정보를 조회한다.
     *
     * @param latitude 위도
     * @param longitude 경도
     * @param emdCd 읍면동 코드(선택)
     * @return 조회된 지적도 정보. 실패 시 Optional.empty()
     */
    public Optional<VworldCadastralInfo> fetchByCoordinates(double latitude, double longitude, String emdCd) {
        String normalizedApiKey = normalizeApiKey(apiKey);
        if (!StringUtils.hasText(normalizedApiKey)) {
            log.warn("VWorld API 키가 비어 있어 지적도 조회를 건너뜁니다. VWORLD_API_KEY를 확인하세요.");
            return Optional.empty();
        }

        try {
            Optional<String> normalizedEmdCd = normalizeEmdCd(emdCd);
            String geometry = String.format("POINT(%s %s)", longitude, latitude);

            WebClient.RequestHeadersSpec<?> requestSpec = webClientBuilder.baseUrl(baseUrl)
                    .build()
                    .get()
                    .uri(uriBuilder -> uriBuilder
                            .path(cadastralPath)
                            .queryParam("apiKey", normalizedApiKey)
                            .queryParam("geometry", geometry)
                            .queryParam("output", output)
                            .queryParam("srsName", srsName)
                            .queryParam("propertyname", propertyName)
                            .queryParam("buffer", buffer)
                            .queryParam("pageIndex", pageIndex)
                            .queryParam("pageUnit", pageUnit)
                            .queryParamIfPresent("emdCd", normalizedEmdCd)
                            .build(true));

            if (StringUtils.hasText(referer)) {
                requestSpec = requestSpec.header(HttpHeaders.REFERER, referer.trim());
            }

            log.info("VWorld 지적도 조회 요청. endpoint={}{}?apiKey=****, geometry={}, emdCd={}, referer={}, srsName={}, propertyName={}",
                    baseUrl,
                    cadastralPath,
                    geometry,
                    normalizedEmdCd.orElse("(없음)"),
                    StringUtils.hasText(referer) ? referer : "(없음)",
                    srsName,
                    propertyName);

            JsonNode root = requestSpec
                    .retrieve()
                    .bodyToMono(JsonNode.class)
                    .block(Duration.ofSeconds(timeoutSeconds));

            if (root == null) {
                log.warn("VWorld 응답 본문이 비어 있습니다. latitude={}, longitude={}, emdCd={}",
                        latitude,
                        longitude,
                        normalizedEmdCd.orElse("(없음)"));
                return Optional.empty();
            }

            Optional<String> headerResultCode = readPathText(root, "header.resultCode");
            Optional<String> headerResultMsg = readPathText(root, "header.resultMsg");
            if (isHeaderError(headerResultCode)) {
                log.warn("VWorld header 오류. resultCode={}, resultMsg={}, latitude={}, longitude={}, emdCd={}, referer={}",
                        headerResultCode.orElse("(없음)"),
                        headerResultMsg.orElse("(없음)"),
                        latitude,
                        longitude,
                        normalizedEmdCd.orElse("(없음)"),
                        StringUtils.hasText(referer) ? referer : "(없음)");

                if (headerResultMsg.orElse("").contains("referer")) {
                    log.error("등록된 URL과 Referer가 다릅니다. VWORLD_REFERER를 VWorld에 등록한 URL과 동일하게 설정하세요.");
                }
                return Optional.empty();
            }

            Optional<String> responseStatus = readPathText(root, "response.status");
            Optional<String> errorCode = readPathText(root, "response.error.code");
            Optional<String> errorText = readPathText(root, "response.error.text");

            if ("ERROR".equalsIgnoreCase(responseStatus.orElse(""))) {
                log.warn("VWorld response 오류. code={}, text={}, latitude={}, longitude={}, emdCd={}",
                        errorCode.orElse("(없음)"),
                        errorText.orElse("(없음)"),
                        latitude,
                        longitude,
                        normalizedEmdCd.orElse("(없음)"));

                if ("INCORRECT_KEY".equalsIgnoreCase(errorCode.orElse(""))) {
                    log.error("VWorld 인증키가 거부되었습니다. 발급키 타입/허용 URL·IP/실행환경 반영 여부를 확인하세요.");
                }
                return Optional.empty();
            }

            Optional<VworldCadastralInfo> cadastralInfo = extractCadastralInfo(root);
            if (cadastralInfo.isEmpty()) {
                log.warn("VWorld 응답에서 지적도 필드를 찾지 못했습니다. latitude={}, longitude={}, emdCd={}, responseSnippet={}",
                        latitude,
                        longitude,
                        normalizedEmdCd.orElse("(없음)"),
                        truncate(root.toString(), 500));
            }

            return cadastralInfo;
        } catch (Exception e) {
            log.warn("VWorld 지적도 조회 실패. latitude={}, longitude={}, emdCd={}", latitude, longitude, emdCd, e);
            return Optional.empty();
        }
    }

    /**
     * 인증키 문자열을 정규화한다.
     *
     * @param rawKey 원본 인증키
     * @return trim 처리된 인증키
     */
    private String normalizeApiKey(String rawKey) {
        return rawKey == null ? "" : rawKey.trim();
    }

    /**
     * VWorld 조회에 사용할 읍면동 코드를 정규화한다.
     * Swagger 기본값("string") 또는 숫자 형식이 아닌 값은 조회 조건에서 제외한다.
     *
     * @param emdCd 요청으로 전달된 읍면동 코드
     * @return 유효한 읍면동 코드 Optional
     */
    private Optional<String> normalizeEmdCd(String emdCd) {
        if (!StringUtils.hasText(emdCd)) {
            return Optional.empty();
        }

        String trimmed = emdCd.trim();
        if ("string".equalsIgnoreCase(trimmed)) {
            log.warn("emdCd가 Swagger 기본값(string)으로 전달되어 조회 조건에서 제외합니다.");
            return Optional.empty();
        }

        if (!EMD_CD_PATTERN.matcher(trimmed).matches()) {
            log.warn("emdCd 형식이 올바르지 않아 조회 조건에서 제외합니다. emdCd={}", trimmed);
            return Optional.empty();
        }

        return Optional.of(trimmed);
    }

    private Optional<VworldCadastralInfo> extractCadastralInfo(JsonNode root) {
        String pnu = findFirstTextByFieldNames(root, "pnu").orElse("");
        String jibun = findFirstTextByFieldNames(root, "jibun").orElse("");
        String addr = findFirstTextByFieldNames(root, "addr").orElse("");
        String geometry = findFirstFieldValue(root, "ag_geom", "geometry")
                .map(this::toGeometryRawText)
                .orElse("");

        String address = StringUtils.hasText(addr) ? addr : jibun;
        if (!StringUtils.hasText(geometry)) {
            log.warn("VWorld 응답에 geometry(ag_geom) 값이 없습니다.");
            return Optional.empty();
        }
        if (!StringUtils.hasText(pnu) && !StringUtils.hasText(address)) {
            log.warn("VWorld 응답에 pnu/주소 값이 없습니다.");
            return Optional.empty();
        }

        log.info("VWorld 필드 추출 완료. pnu={}, addressPresent={}, geometryLength={}, geometryPreview={}",
                StringUtils.hasText(pnu) ? pnu : "(없음)",
                StringUtils.hasText(address),
                geometry.length(),
                truncate(geometry, 120));
        return Optional.of(new VworldCadastralInfo(pnu, address, geometry));
    }

    private Optional<String> findFirstTextByFieldNames(JsonNode root, String... fieldNames) {
        return findFirstFieldValue(root, fieldNames)
                .map(JsonNode::asText)
                .map(String::trim)
                .filter(StringUtils::hasText);
    }

    private Optional<JsonNode> findFirstFieldValue(JsonNode root, String... fieldNames) {
        if (root == null || fieldNames == null || fieldNames.length == 0) {
            return Optional.empty();
        }

        Deque<JsonNode> queue = new ArrayDeque<>();
        queue.add(root);

        while (!queue.isEmpty()) {
            JsonNode node = queue.poll();
            if (node == null || node.isMissingNode() || node.isNull()) {
                continue;
            }

            if (node.isObject()) {
                for (String fieldName : fieldNames) {
                    JsonNode value = node.get(fieldName);
                    if (value != null && !value.isMissingNode() && !value.isNull()) {
                        if (!value.isTextual() || StringUtils.hasText(value.asText())) {
                            return Optional.of(value);
                        }
                    }
                }

                Iterator<JsonNode> fields = node.elements();
                while (fields.hasNext()) {
                    queue.add(fields.next());
                }
                continue;
            }

            if (node.isArray()) {
                for (JsonNode child : node) {
                    queue.add(child);
                }
            }
        }
        return Optional.empty();
    }

    private String toGeometryRawText(JsonNode geometryNode) {
        if (geometryNode == null || geometryNode.isMissingNode() || geometryNode.isNull()) {
            return "";
        }

        if (geometryNode.isTextual() || geometryNode.isNumber() || geometryNode.isBoolean()) {
            return Optional.ofNullable(geometryNode.asText(null)).orElse("").trim();
        }

        return geometryNode.toString();
    }

    private Optional<String> readPathText(JsonNode root, String dottedPath) {
        if (root == null || !StringUtils.hasText(dottedPath)) {
            return Optional.empty();
        }

        JsonNode current = root;
        String[] segments = dottedPath.split("\\.");
        for (String segment : segments) {
            if (current == null || current.isMissingNode() || current.isNull()) {
                return Optional.empty();
            }
            current = current.path(segment);
        }

        if (current == null || current.isMissingNode() || current.isNull()) {
            return Optional.empty();
        }

        String value = current.asText(null);
        if (!StringUtils.hasText(value)) {
            return Optional.empty();
        }

        return Optional.of(value.trim());
    }

    private boolean isHeaderError(Optional<String> resultCode) {
        if (resultCode.isEmpty()) {
            return false;
        }

        String code = resultCode.get().trim();
        return !("0".equals(code) || "00".equals(code) || "200".equals(code));
    }

    private String truncate(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) {
            return value;
        }

        return value.substring(0, maxLength) + "...";
    }
}
