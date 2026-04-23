package com.a204.batang.domain.project.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * 지적도 geometry(WKT)를 프런트에서 바로 사용할 수 있는 MultiPolygon 좌표 구조로 변환한 DTO.
 *
 * @param type GeoJSON 타입
 * @param coordinates MultiPolygon 좌표
 */
public record CadastralPolygonResponse(
        String type,
        List<List<List<List<Double>>>> coordinates
) {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    /**
     * geometry 문자열을 MultiPolygon 좌표 구조로 변환한다.
     * WKT(POLYGON/MULTIPOLYGON)와 GeoJSON(type/coordinates) 모두 지원한다.
     *
     * @param rawGeometry VWorld 응답의 geometry 원문
     * @return 변환된 MultiPolygon DTO, 변환 실패 시 null
     */
    public static CadastralPolygonResponse fromRawGeometry(String rawGeometry) {
        if (!StringUtils.hasText(rawGeometry)) {
            return null;
        }

        CadastralPolygonResponse fromWkt = fromWkt(rawGeometry);
        if (fromWkt != null) {
            return fromWkt;
        }

        return fromGeoJson(rawGeometry);
    }

    /**
     * WKT(Polygon/MultiPolygon)를 MultiPolygon 좌표로 변환한다.
     *
     * @param geometryWkt VWorld에서 전달받은 geometry 문자열
     * @return 변환된 폴리곤 DTO. 변환 실패 시 null
     */
    public static CadastralPolygonResponse fromWkt(String geometryWkt) {
        if (!StringUtils.hasText(geometryWkt)) {
            return null;
        }

        String normalized = normalizeWktPrefix(geometryWkt);
        if (startsWithIgnoreCase(normalized, "MULTIPOLYGON")) {
            String body = normalized.substring("MULTIPOLYGON".length()).trim();
            List<List<List<List<Double>>>> multiPolygon = parseMultiPolygonBody(body);
            if (multiPolygon.isEmpty()) {
                return null;
            }
            return new CadastralPolygonResponse("MultiPolygon", List.copyOf(multiPolygon));
        }

        if (startsWithIgnoreCase(normalized, "POLYGON")) {
            String body = normalized.substring("POLYGON".length()).trim();
            List<List<List<Double>>> polygon = parsePolygonBody(body);
            if (polygon.isEmpty()) {
                return null;
            }
            return new CadastralPolygonResponse("MultiPolygon", List.of(List.copyOf(polygon)));
        }

        return null;
    }

    private static CadastralPolygonResponse fromGeoJson(String geometryJson) {
        try {
            JsonNode root = OBJECT_MAPPER.readTree(geometryJson);
            return parseGeoJsonNode(root);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static CadastralPolygonResponse parseGeoJsonNode(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }

        if (node.isTextual()) {
            String text = node.asText();
            if (!StringUtils.hasText(text)) {
                return null;
            }
            return fromRawGeometry(text);
        }

        if (!node.isObject()) {
            return null;
        }

        if (node.has("ag_geom")) {
            CadastralPolygonResponse nested = parseGeoJsonNode(node.get("ag_geom"));
            if (nested != null) {
                return nested;
            }
        }

        String geometryType = node.path("type").asText("");
        JsonNode coordinatesNode = node.path("coordinates");
        if (!coordinatesNode.isArray()) {
            return null;
        }

        if ("Polygon".equalsIgnoreCase(geometryType)) {
            List<List<List<Double>>> polygon = parsePolygonCoordinates(coordinatesNode);
            if (polygon.isEmpty()) {
                return null;
            }
            return new CadastralPolygonResponse("MultiPolygon", List.of(List.copyOf(polygon)));
        }

        if ("MultiPolygon".equalsIgnoreCase(geometryType)) {
            List<List<List<List<Double>>>> multiPolygon = parseMultiPolygonCoordinates(coordinatesNode);
            if (multiPolygon.isEmpty()) {
                return null;
            }
            return new CadastralPolygonResponse("MultiPolygon", List.copyOf(multiPolygon));
        }

        return null;
    }

    private static List<List<List<List<Double>>>> parseMultiPolygonCoordinates(JsonNode coordinatesNode) {
        List<List<List<List<Double>>>> result = new ArrayList<>();
        for (JsonNode polygonNode : coordinatesNode) {
            List<List<List<Double>>> polygon = parsePolygonCoordinates(polygonNode);
            if (!polygon.isEmpty()) {
                result.add(List.copyOf(polygon));
            }
        }
        return result;
    }

    private static List<List<List<Double>>> parsePolygonCoordinates(JsonNode polygonNode) {
        if (polygonNode == null || !polygonNode.isArray()) {
            return Collections.emptyList();
        }

        List<List<List<Double>>> polygon = new ArrayList<>();
        for (JsonNode ringNode : polygonNode) {
            List<List<Double>> ring = parseRingCoordinates(ringNode);
            if (!ring.isEmpty()) {
                polygon.add(List.copyOf(ring));
            }
        }
        return polygon;
    }

    private static List<List<Double>> parseRingCoordinates(JsonNode ringNode) {
        if (ringNode == null || !ringNode.isArray()) {
            return Collections.emptyList();
        }

        List<List<Double>> ring = new ArrayList<>();
        for (JsonNode pointNode : ringNode) {
            List<Double> point = parsePointCoordinates(pointNode);
            if (!point.isEmpty()) {
                ring.add(point);
            }
        }
        return ring;
    }

    private static List<Double> parsePointCoordinates(JsonNode pointNode) {
        if (pointNode == null || !pointNode.isArray() || pointNode.size() < 2) {
            return Collections.emptyList();
        }

        try {
            double x = pointNode.get(0).asDouble();
            double y = pointNode.get(1).asDouble();
            return List.of(x, y);
        } catch (Exception ignored) {
            return Collections.emptyList();
        }
    }

    private static List<List<List<List<Double>>>> parseMultiPolygonBody(String body) {
        String normalizedBody = unwrapIfSingleWrapped(body);
        List<String> polygonGroups = extractTopLevelGroups(normalizedBody);
        if (polygonGroups.isEmpty()) {
            return Collections.emptyList();
        }

        List<List<List<List<Double>>>> result = new ArrayList<>();
        for (String polygonGroup : polygonGroups) {
            List<List<List<Double>>> polygon = parsePolygonBody(polygonGroup);
            if (!polygon.isEmpty()) {
                result.add(List.copyOf(polygon));
            }
        }
        return result;
    }

    private static List<List<List<Double>>> parsePolygonBody(String body) {
        String normalizedBody = unwrapIfSingleWrapped(body);
        List<String> ringGroups = extractTopLevelGroups(normalizedBody);
        if (ringGroups.isEmpty()) {
            return Collections.emptyList();
        }

        List<List<List<Double>>> polygon = new ArrayList<>();
        for (String ringGroup : ringGroups) {
            List<List<Double>> ring = parseRing(ringGroup);
            if (!ring.isEmpty()) {
                polygon.add(List.copyOf(ring));
            }
        }
        return polygon;
    }

    private static List<List<Double>> parseRing(String ringGroup) {
        String ringBody = unwrapIfSingleWrapped(ringGroup);
        if (!StringUtils.hasText(ringBody)) {
            return Collections.emptyList();
        }

        String[] pointTokens = ringBody.split(",");
        List<List<Double>> ring = new ArrayList<>();
        for (String pointToken : pointTokens) {
            String trimmedPoint = pointToken.trim();
            if (!StringUtils.hasText(trimmedPoint)) {
                continue;
            }

            String[] values = trimmedPoint.split("\\s+");
            if (values.length < 2) {
                continue;
            }

            try {
                double x = Double.parseDouble(values[0]);
                double y = Double.parseDouble(values[1]);
                ring.add(List.of(x, y));
            } catch (NumberFormatException ignored) {
                return Collections.emptyList();
            }
        }

        return ring;
    }

    private static List<String> extractTopLevelGroups(String text) {
        if (!StringUtils.hasText(text)) {
            return Collections.emptyList();
        }

        List<String> groups = new ArrayList<>();
        int depth = 0;
        int start = -1;

        for (int i = 0; i < text.length(); i++) {
            char ch = text.charAt(i);
            if (ch == '(') {
                if (depth == 0) {
                    start = i;
                }
                depth++;
            } else if (ch == ')') {
                if (depth == 0) {
                    continue;
                }
                depth--;
                if (depth == 0 && start >= 0) {
                    groups.add(text.substring(start, i + 1));
                    start = -1;
                }
            }
        }

        return groups;
    }

    private static String unwrapIfSingleWrapped(String text) {
        String trimmed = text == null ? "" : text.trim();
        if (!isSingleWrapped(trimmed)) {
            return trimmed;
        }
        return trimmed.substring(1, trimmed.length() - 1).trim();
    }

    private static boolean isSingleWrapped(String text) {
        if (!StringUtils.hasText(text) || text.charAt(0) != '(' || text.charAt(text.length() - 1) != ')') {
            return false;
        }

        int depth = 0;
        for (int i = 0; i < text.length(); i++) {
            char ch = text.charAt(i);
            if (ch == '(') {
                depth++;
            } else if (ch == ')') {
                depth--;
                if (depth == 0 && i < text.length() - 1) {
                    return false;
                }
            }

            if (depth < 0) {
                return false;
            }
        }

        return depth == 0;
    }

    private static boolean startsWithIgnoreCase(String source, String prefix) {
        return source.regionMatches(true, 0, prefix, 0, prefix.length());
    }

    private static String normalizeWktPrefix(String rawWkt) {
        String normalized = rawWkt == null ? "" : rawWkt.trim();
        if (!startsWithIgnoreCase(normalized, "SRID=")) {
            return normalized;
        }

        int separatorIndex = normalized.indexOf(';');
        if (separatorIndex < 0 || separatorIndex == normalized.length() - 1) {
            return normalized;
        }

        return normalized.substring(separatorIndex + 1).trim();
    }
}
