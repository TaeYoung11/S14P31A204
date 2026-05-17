package com.a204.batang.domain.floorplan.service;

import com.a204.batang.domain.floorplan.FloorPlanConstants;
import com.a204.batang.domain.floorplan.dto.LayoutImportV2Payload;
import com.a204.batang.domain.workspace.dto.BubbleSnapshotPayload;
import com.a204.batang.domain.workspace.dto.BubbleUpdateRequest.BubbleData;
import com.a204.batang.domain.workspace.dto.BubbleUpdateRequest.ConnectionData;
import com.a204.batang.domain.workspace.dto.BubbleZoneData;
import com.a204.batang.domain.workspace.service.BubbleSnapshotHelper;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Floor-plan 입력을 layout_import_v2로 정규화하는 순수 변환 + 검증 레이어다.
 *
 * 이 클래스는 repository를 직접 보지 않는다. raw 요청과 snapshot fallback을
 * 같은 payload 형태로 맞추는 데만 집중해야 이후 command/service/event 계층의
 * 책임이 섞이지 않기 때문이다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class FloorPlanLayoutImportMapper {

    private static final double DEFAULT_MM_PER_PX = 25.0;

    private final ObjectMapper objectMapper;
    private final Validator validator;
    private final BubbleSnapshotHelper bubbleSnapshotHelper;

    /**
     * raw 요청의 layoutImport를 검증하고 layout_import_v2 DTO로 정규화한다.
     *
     * raw 요청이 존재하면 snapshot fallback으로 우회하지 않는다.
     * 잘못된 raw 요청은 입력 오류로 바로 종료해야 호출자가 우선순위를 오해하지 않는다.
     */
    public LayoutImportV2Payload fromRawRequest(UUID projectId, String projectName, JsonNode layoutImportNode) {
        Objects.requireNonNull(projectId, "projectId must not be null");
        String resolvedProjectName = requireProjectName(projectName);

        if (layoutImportNode == null || layoutImportNode.isNull() || !layoutImportNode.isObject()) {
            throw new CustomException(ErrorCode.FLOOR_PLAN_LAYOUT_INVALID, "layoutImport는 JSON object여야 합니다.");
        }

        try {
            LayoutImportV2Payload payload = objectMapper.treeToValue(layoutImportNode, LayoutImportV2Payload.class);
            validateRawPayload(payload, projectId, resolvedProjectName);
            log.info(
                    "Floor-plan raw 요청을 layout import로 정규화했습니다. projectId={}, inputSource={}, roomCount={}, connectionCount={}",
                    projectId,
                    FloorPlanConstants.INPUT_SOURCE_RAW_REQUEST,
                    payload.rooms().size(),
                    payload.adjacency() == null ? 0 : payload.adjacency().size()
            );
            return payload;
        } catch (CustomException e) {
            throw e;
        } catch (Exception e) {
            throw new CustomException(ErrorCode.FLOOR_PLAN_LAYOUT_INVALID, "layoutImport를 파싱할 수 없습니다.");
        }
    }

    /**
     * workspace snapshot을 layout_import_v2 DTO로 변환한다.
     *
     * snapshot fallback은 raw 요청이 없을 때만 사용한다. snapshot source에 없는
     * zones/boundaries/modeling_defaults를 억지로 만들지 않고, aggregate 정보만
     * 보강해서 worker가 이해할 수 있는 최소 payload로 정규화한다.
     */
    public LayoutImportV2Payload fromBubbleSnapshot(UUID projectId, String projectName, JsonNode snapshotNode) {
        Objects.requireNonNull(projectId, "projectId must not be null");
        String resolvedProjectName = requireProjectName(projectName);

        BubbleSnapshotPayload payload;
        try {
            payload = bubbleSnapshotHelper.readSnapshotPayloadOrThrow(snapshotNode);
        } catch (CustomException e) {
            throw new CustomException(ErrorCode.FLOOR_PLAN_SNAPSHOT_CONVERSION_FAILED, e.getMessage());
        }

        List<BubbleData> bubbles = payload.bubbles();
        List<ConnectionData> connections = payload.connections();
        List<BubbleZoneData> zones = payload.zones() == null ? List.of() : payload.zones();

        if (bubbles == null || bubbles.isEmpty()) {
            throw new CustomException(
                    ErrorCode.FLOOR_PLAN_SNAPSHOT_CONVERSION_FAILED,
                    "workspace snapshot에는 최소 하나 이상의 bubble이 있어야 합니다."
            );
        }

        validateSnapshotBubblesOrThrow(bubbles);
        validateSnapshotConnectionsOrThrow(bubbles, connections);

        Map<String, Integer> floorByBubbleId = new LinkedHashMap<>();
        for (BubbleData bubble : bubbles) {
            floorByBubbleId.put(bubble.id(), normalizeFloorNumber(bubble.floor()));
        }

        SnapshotZoneMappingResult zoneMapping = mapSnapshotZonesByFloor(zones, floorByBubbleId);

        double mmPerPx = resolveMmPerPx(bubbles);
        int unmappedRoomTypeCount = 0;
        List<LayoutImportV2Payload.Room> rooms = new ArrayList<>();
        for (BubbleData bubble : bubbles) {
            String normalizedType = normalizeRoomType(bubble.type());
            if ("other".equals(normalizedType) && !isKnownMappedRoomType(bubble.type())) {
                unmappedRoomTypeCount++;
            }

            rooms.add(new LayoutImportV2Payload.Room(
                    bubble.id(),
                    bubble.id(),
                    bubble.label(),
                    bubble.originalType() == null || bubble.originalType().isBlank()
                            ? bubble.type()
                            : bubble.originalType(),
                    bubble.label(),
                    normalizedType,
                    roundPositiveMillimeter(bubble.widthMm(), "bubble widthMm"),
                    roundPositiveMillimeter(bubble.heightMm(), "bubble heightMm"),
                    normalizeFloorNumber(bubble.floor()),
                    bubble.x() * mmPerPx,
                    bubble.y() * mmPerPx,
                    0.0,
                    false,
                    hasText(bubble.material()) ? bubble.material().trim() : null,
                    hasText(bubble.color()) ? bubble.color().trim() : null,
                    normalizeWallType(bubble.wallType()),
                    zoneMapping.zoneIdByBubbleId().get(bubble.id())
            ));
        }

        List<LayoutImportV2Payload.Adjacency> adjacency = connections.stream()
                .map(connection -> new LayoutImportV2Payload.Adjacency(
                        hasText(connection.id()) ? connection.id().trim() : null,
                        connection.from(),
                        connection.to(),
                        mapConnectionStrength(connection.type()),
                        mapConnectionIntent(connection),
                        mapConnectionStrengthName(connection.type()),
                        connection.from(),
                        connection.to()
                ))
                .toList();

        LayoutImportV2Payload mapped = new LayoutImportV2Payload(
                "v2",
                projectId.toString(),
                resolvedProjectName,
                rooms,
                zoneMapping.zones().isEmpty() ? null : zoneMapping.zones(),
                adjacency.isEmpty() ? null : adjacency,
                null,
                defaultGenerationOptions(),
                null,
                defaultGenerationPolicy()
        );

        validateGeneratedPayload(mapped, ErrorCode.FLOOR_PLAN_SNAPSHOT_CONVERSION_FAILED);

        log.info(
                "Workspace snapshot을 layout import로 변환했습니다. projectId={}, inputSource={}, roomCount={}, connectionCount={}, unmappedRoomTypeCount={}, mmPerPx={}",
                projectId,
                FloorPlanConstants.INPUT_SOURCE_WORKSPACE_SNAPSHOT,
                rooms.size(),
                adjacency.size(),
                unmappedRoomTypeCount,
                mmPerPx
        );

        return mapped;
    }

    private void validateRawPayload(LayoutImportV2Payload payload, UUID projectId, String projectName) {
        if (payload == null) {
            throw new CustomException(ErrorCode.FLOOR_PLAN_LAYOUT_INVALID, "layoutImport는 필수입니다.");
        }
        if (!"v2".equals(payload.schemaVersion())) {
            throw new CustomException(ErrorCode.FLOOR_PLAN_LAYOUT_INVALID, "schema_version은 v2여야 합니다.");
        }
        if (payload.rooms() == null || payload.rooms().isEmpty()) {
            throw new CustomException(ErrorCode.FLOOR_PLAN_LAYOUT_INVALID, "rooms는 비어 있을 수 없습니다.");
        }
        validateGeneratedPayload(payload, ErrorCode.FLOOR_PLAN_LAYOUT_INVALID);

        log.debug(
                "Raw floor-plan layout import payload 검증이 완료되었습니다. projectId={}, projectName={}, roomCount={}",
                projectId,
                projectName,
                payload.rooms().size()
        );
    }

    private void validateGeneratedPayload(LayoutImportV2Payload payload, ErrorCode errorCode) {
        Set<ConstraintViolation<LayoutImportV2Payload>> violations = validator.validate(payload);
        if (!violations.isEmpty()) {
            String message = violations.stream()
                    .map(ConstraintViolation::getMessage)
                    .sorted()
                    .collect(Collectors.joining(", "));
            throw new CustomException(errorCode, message);
        }
    }

    private void validateSnapshotBubblesOrThrow(List<BubbleData> bubbles) {
        Set<String> bubbleIds = new HashSet<>();
        for (BubbleData bubble : bubbles) {
            if (!bubbleIds.add(bubble.id())) {
                throw new CustomException(
                        ErrorCode.FLOOR_PLAN_SNAPSHOT_CONVERSION_FAILED,
                        "중복 bubble id는 허용되지 않습니다."
                );
            }
            requireFinitePositive(bubble.width(), "bubble width");
            requireFinitePositive(bubble.height(), "bubble height");
            requireFinitePositive(bubble.widthMm(), "bubble widthMm");
            requireFinitePositive(bubble.heightMm(), "bubble heightMm");
            requireFinite(bubble.x(), "bubble x");
            requireFinite(bubble.y(), "bubble y");
        }
    }

    private void validateSnapshotConnectionsOrThrow(List<BubbleData> bubbles, List<ConnectionData> connections) {
        Set<String> bubbleIds = bubbles.stream().map(BubbleData::id).collect(Collectors.toSet());
        for (ConnectionData connection : connections) {
            if (!bubbleIds.contains(connection.from()) || !bubbleIds.contains(connection.to())) {
                throw new CustomException(
                        ErrorCode.FLOOR_PLAN_SNAPSHOT_CONVERSION_FAILED,
                        "connection이 존재하지 않는 bubble id를 참조하고 있습니다."
                );
            }
            mapConnectionStrength(connection.type());
        }
    }

    private int roundPositiveMillimeter(Double millimeter, String fieldName) {
        requireFinitePositive(millimeter, fieldName);
        long rounded = Math.round(millimeter);
        if (rounded <= 0L || rounded > Integer.MAX_VALUE) {
            throw new CustomException(
                    ErrorCode.FLOOR_PLAN_SNAPSHOT_CONVERSION_FAILED,
                    fieldName + "는 범위 내 양의 정수여야 합니다."
            );
        }
        return (int) rounded;
    }

    /*
     * NOTE:
     * 계획상 mmPerPx의 최종 fallback 25가 있었지만, 현재 구현은 bubble width/height/widthMm/heightMm
     * 양수 검증을 먼저 수행하므로 그 경로에 도달하지 않는다. 현재는 fail-fast 정책을 유지하고,
     * fallback 25는 별도 정책 변경 후보로 남긴다.
     */
    private double resolveMmPerPx(List<BubbleData> bubbles) {
        for (BubbleData bubble : bubbles) {
            if (isFinitePositive(bubble.widthMm()) && isFinitePositive(bubble.width())) {
                return bubble.widthMm() / bubble.width();
            }
            if (isFinitePositive(bubble.heightMm()) && isFinitePositive(bubble.height())) {
                return bubble.heightMm() / bubble.height();
            }
        }
        return DEFAULT_MM_PER_PX;
    }

    private String normalizeRoomType(String rawType) {
        if (rawType == null || rawType.isBlank()) {
            return "other";
        }

        String normalized = rawType.trim().toLowerCase(Locale.ROOT);
        return switch (normalized) {
            case "거실", "living" -> "living";
            case "침실", "bedroom", "방" -> "bedroom";
            case "주방", "kitchen" -> "kitchen";
            case "화장실", "욕실", "bathroom" -> "bathroom";
            case "현관", "entrance" -> "entrance";
            case "복도", "corridor" -> "corridor";
            case "사무실", "office" -> "office";
            case "미선택", "other" -> "other";
            default -> "other";
        };
    }

    private boolean isKnownMappedRoomType(String rawType) {
        if (rawType == null || rawType.isBlank()) {
            return false;
        }
        String normalized = rawType.trim().toLowerCase(Locale.ROOT);
        return Set.of(
                "거실", "living",
                "침실", "bedroom", "방",
                "주방", "kitchen",
                "화장실", "욕실", "bathroom",
                "현관", "entrance",
                "복도", "corridor",
                "사무실", "office",
                "미선택", "other"
        ).contains(normalized);
    }

    private double mapConnectionStrength(String type) {
        if (type == null) {
            throw new CustomException(
                    ErrorCode.FLOOR_PLAN_SNAPSHOT_CONVERSION_FAILED,
                    "connection type은 필수입니다."
            );
        }

        return switch (type.trim().toLowerCase(Locale.ROOT)) {
            case "bold" -> 1.0;
            case "thin" -> 0.6;
            case "dashed" -> 0.3;
            default -> throw new CustomException(
                    ErrorCode.FLOOR_PLAN_SNAPSHOT_CONVERSION_FAILED,
                    "지원하지 않는 connection type입니다. " + type
            );
        };
    }

    private String mapConnectionStrengthName(String type) {
        if (type == null) {
            return "normal";
        }
        return switch (type.trim().toLowerCase(Locale.ROOT)) {
            case "bold" -> "strong";
            case "dashed" -> "weak";
            default -> "normal";
        };
    }

    private String mapConnectionIntent(ConnectionData connection) {
        if (hasText(connection.intent())) {
            String intent = connection.intent().trim();
            if (Set.of("circulation", "open_passage", "weak_relation", "merge").contains(intent)) {
                return intent;
            }
        }
        if (connection.type() == null) {
            return "circulation";
        }
        return switch (connection.type().trim().toLowerCase(Locale.ROOT)) {
            case "bold" -> "open_passage";
            case "dashed" -> "weak_relation";
            default -> "circulation";
        };
    }

    private String normalizeWallType(String wallType) {
        if (!hasText(wallType)) {
            return null;
        }
        return switch (wallType.trim()) {
            case "general", "exterior", "partition", "load_bearing" -> wallType.trim();
            case "loadBearing" -> "load_bearing";
            default -> null;
        };
    }

    private LayoutImportV2Payload.GenerationOptions defaultGenerationOptions() {
        return new LayoutImportV2Payload.GenerationOptions(true, true, true, true, true);
    }

    private LayoutImportV2Payload.GenerationPolicy defaultGenerationPolicy() {
        return new LayoutImportV2Payload.GenerationPolicy("outer_boundary", "from_adjacency", "flat");
    }

    private SnapshotZoneMappingResult mapSnapshotZonesByFloor(
            List<BubbleZoneData> zones,
            Map<String, Integer> floorByBubbleId
    ) {
        if (zones == null || zones.isEmpty()) {
            return new SnapshotZoneMappingResult(List.of(), Map.of());
        }

        List<LayoutImportV2Payload.Zone> mappedZones = new ArrayList<>();
        Map<String, String> zoneIdByBubbleId = new LinkedHashMap<>();
        Set<String> mappedZoneIds = new HashSet<>();

        for (BubbleZoneData zone : zones) {
            if (
                    zone == null
                            || !hasText(zone.id())
                            || !hasText(zone.name())
                            || !hasText(zone.color())
                            || zone.bubbleIds() == null
                            || zone.bubbleIds().isEmpty()
            ) {
                throw new CustomException(
                        ErrorCode.FLOOR_PLAN_SNAPSHOT_CONVERSION_FAILED,
                        "zone 필드(id/name/color/bubbleIds)는 모두 유효해야 합니다."
                );
            }

            Map<Integer, List<String>> bubbleIdsByFloor = new LinkedHashMap<>();
            for (String bubbleId : zone.bubbleIds()) {
                Integer floor = floorByBubbleId.get(bubbleId);
                if (floor == null) continue;
                bubbleIdsByFloor.computeIfAbsent(floor, key -> new ArrayList<>()).add(bubbleId);
            }

            if (bubbleIdsByFloor.isEmpty()) {
                continue;
            }

            boolean splitByFloor = bubbleIdsByFloor.size() > 1;
            for (Map.Entry<Integer, List<String>> entry : bubbleIdsByFloor.entrySet()) {
                Integer floor = entry.getKey();
                String zoneId = zone.id().trim();
                String resolvedZoneId = splitByFloor ? zoneId + "-f" + floor : zoneId;
                if (!mappedZoneIds.add(resolvedZoneId)) {
                    throw new CustomException(
                            ErrorCode.FLOOR_PLAN_SNAPSHOT_CONVERSION_FAILED,
                            "zone id가 층 분할 후 중복됩니다: " + resolvedZoneId
                    );
                }
                mappedZones.add(new LayoutImportV2Payload.Zone(
                        resolvedZoneId,
                        zone.name().trim(),
                        zone.color().trim(),
                        floor
                ));

                for (String bubbleId : entry.getValue()) {
                    String previousZoneId = zoneIdByBubbleId.putIfAbsent(bubbleId, resolvedZoneId);
                    if (previousZoneId != null && !previousZoneId.equals(resolvedZoneId)) {
                        throw new CustomException(
                                ErrorCode.FLOOR_PLAN_SNAPSHOT_CONVERSION_FAILED,
                                "동일 bubble이 여러 zone에 매핑되었습니다. bubbleId="
                                        + bubbleId
                                        + ", zones="
                                        + previousZoneId
                                        + ","
                                        + resolvedZoneId
                        );
                    }
                }
            }
        }

        return new SnapshotZoneMappingResult(mappedZones, zoneIdByBubbleId);
    }

    private String requireProjectName(String projectName) {
        if (projectName == null || projectName.isBlank()) {
            throw new CustomException(ErrorCode.FLOOR_PLAN_LAYOUT_INVALID, "project name은 비어 있을 수 없습니다.");
        }
        return projectName;
    }

    private int normalizeFloorNumber(Integer floor) {
        return floor != null && floor > 0 ? floor : 1;
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private void requireFinite(Double value, String fieldName) {
        if (value == null || !Double.isFinite(value)) {
            throw new CustomException(
                    ErrorCode.FLOOR_PLAN_SNAPSHOT_CONVERSION_FAILED,
                    fieldName + "는 유한한 숫자여야 합니다."
            );
        }
    }

    private void requireFinitePositive(Double value, String fieldName) {
        if (!isFinitePositive(value)) {
            throw new CustomException(
                    ErrorCode.FLOOR_PLAN_SNAPSHOT_CONVERSION_FAILED,
                    fieldName + "는 양수이면서 유한한 숫자여야 합니다."
            );
        }
    }

    private boolean isFinitePositive(Double value) {
        return value != null && Double.isFinite(value) && value > 0.0;
    }

    private record SnapshotZoneMappingResult(
            List<LayoutImportV2Payload.Zone> zones,
            Map<String, String> zoneIdByBubbleId
    ) {
    }
}
