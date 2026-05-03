package com.a204.batang.domain.floorplan.service;

import com.a204.batang.domain.floorplan.dto.LayoutImportV2Payload;
import com.a204.batang.domain.workspace.service.BubbleSnapshotHelper;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class FloorPlanLayoutImportMapperTest {

    /*
     * NOTE:
     * 계획상 mmPerPx 최종 fallback 25가 있었지만, 현재 구현은 bubble width/height/widthMm/heightMm
     * 양수 검증을 먼저 수행하므로 해당 fallback 경로에 도달하지 않는다.
     * fail-fast 동작을 테스트로 고정하고, fallback 25 정책은 별도 정책 변경 후보로 남긴다.
     */

    private final ObjectMapper objectMapper = new ObjectMapper();

    private FloorPlanLayoutImportMapper mapper;

    @BeforeEach
    void setUp() {
        Validator validator = Validation.buildDefaultValidatorFactory().getValidator();
        mapper = new FloorPlanLayoutImportMapper(
                objectMapper,
                validator,
                new BubbleSnapshotHelper(objectMapper)
        );
    }

    @Test
    void fromRawRequest_returnsValidatedPayload() throws Exception {
        JsonNode raw = objectMapper.readTree("""
                {
                  "schema_version": "v2",
                  "id": "550e8400-e29b-41d4-a716-446655440000",
                  "name": "sample-project",
                  "rooms": [
                    {
                      "id": "room-1",
                      "name": "거실",
                      "type": "living",
                      "width": 4200,
                      "height": 3800,
                      "floor": 1,
                      "x": 100.0,
                      "y": 200.0,
                      "angle": 0.0,
                      "locked": false,
                      "zoneId": null
                    }
                  ]
                }
                """);

        LayoutImportV2Payload payload = mapper.fromRawRequest(UUID.randomUUID(), "project-name", raw);

        assertThat(payload.schemaVersion()).isEqualTo("v2");
        assertThat(payload.rooms()).hasSize(1);
    }

    @Test
    void fromRawRequest_throwsWhenSchemaVersionIsInvalid() throws Exception {
        JsonNode raw = objectMapper.readTree("""
                {
                  "schema_version": "v1",
                  "id": "550e8400-e29b-41d4-a716-446655440000",
                  "name": "sample-project",
                  "rooms": [
                    {
                      "id": "room-1",
                      "name": "거실",
                      "type": "living",
                      "width": 4200,
                      "height": 3800,
                      "floor": 1,
                      "x": 100.0,
                      "y": 200.0,
                      "angle": 0.0,
                      "locked": false
                    }
                  ]
                }
                """);

        assertThatThrownBy(() -> mapper.fromRawRequest(UUID.randomUUID(), "project-name", raw))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.FLOOR_PLAN_LAYOUT_INVALID);
    }

    @Test
    void fromRawRequest_throwsWhenPayloadIsNotObject() throws Exception {
        JsonNode raw = objectMapper.readTree("""
                [
                  {
                    "schema_version": "v2"
                  }
                ]
                """);

        assertThatThrownBy(() -> mapper.fromRawRequest(UUID.randomUUID(), "project-name", raw))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.FLOOR_PLAN_LAYOUT_INVALID);
    }

    @Test
    void fromRawRequest_throwsWhenRoomsAreEmpty() throws Exception {
        JsonNode raw = objectMapper.readTree("""
                {
                  "schema_version": "v2",
                  "id": "550e8400-e29b-41d4-a716-446655440000",
                  "name": "sample-project",
                  "rooms": []
                }
                """);

        assertThatThrownBy(() -> mapper.fromRawRequest(UUID.randomUUID(), "project-name", raw))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.FLOOR_PLAN_LAYOUT_INVALID);
    }

    @Test
    void fromBubbleSnapshot_mapsSnapshotToLayoutImportV2() throws Exception {
        JsonNode snapshot = objectMapper.readTree("""
                {
                  "bubbles": [
                    {
                      "id": "bubble-1",
                      "x": 10.0,
                      "y": 20.0,
                      "width": 100.0,
                      "height": 80.0,
                      "widthMm": 2500.0,
                      "heightMm": 2000.0,
                      "label": "현관",
                      "type": "현관",
                      "ratio": 5.0,
                      "color": "#ffffff"
                    },
                    {
                      "id": "bubble-2",
                      "x": 40.0,
                      "y": 50.0,
                      "width": 120.0,
                      "height": 90.0,
                      "widthMm": 3600.0,
                      "heightMm": 2700.0,
                      "label": "방",
                      "type": "방",
                      "ratio": 9.0,
                      "color": "#ffffff"
                    }
                  ],
                  "connections": [
                    {
                      "from": "bubble-1",
                      "to": "bubble-2",
                      "type": "bold"
                    }
                  ]
                }
                """);

        LayoutImportV2Payload payload = mapper.fromBubbleSnapshot(UUID.fromString("550e8400-e29b-41d4-a716-446655440000"), "sample", snapshot);

        assertThat(payload.schemaVersion()).isEqualTo("v2");
        assertThat(payload.id()).isEqualTo("550e8400-e29b-41d4-a716-446655440000");
        assertThat(payload.name()).isEqualTo("sample");
        assertThat(payload.rooms()).hasSize(2);
        assertThat(payload.rooms().get(0).type()).isEqualTo("corridor");
        assertThat(payload.rooms().get(1).type()).isEqualTo("bedroom");
        assertThat(payload.rooms().get(0).x()).isEqualTo(250.0);
        assertThat(payload.rooms().get(0).y()).isEqualTo(500.0);
        assertThat(payload.adjacency()).hasSize(1);
        assertThat(payload.adjacency().get(0).strength()).isEqualTo(1.0);
        assertThat(payload.generationOptions().generateOpenings()).isFalse();
        assertThat(payload.generationPolicy().boundaryWallMode()).isEqualTo("outer_boundary");
        assertThat(payload.zones()).isNull();
        assertThat(payload.boundaries()).isNull();
        assertThat(payload.modelingDefaults()).isNull();
    }

    @Test
    void fromBubbleSnapshot_usesHeightFallbackForMmPerPx() throws Exception {
        JsonNode snapshot = objectMapper.readTree("""
                {
                  "bubbles": [
                    {
                      "id": "bubble-1",
                      "x": 10.0,
                      "y": 20.0,
                      "width": 0.0,
                      "height": 40.0,
                      "widthMm": 0.0,
                      "heightMm": 1000.0,
                      "label": "거실",
                      "type": "거실",
                      "ratio": 5.0,
                      "color": "#ffffff"
                    }
                  ],
                  "connections": []
                }
                """);

        assertThatThrownBy(() -> mapper.fromBubbleSnapshot(UUID.randomUUID(), "sample", snapshot))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.FLOOR_PLAN_SNAPSHOT_CONVERSION_FAILED);
    }

    @Test
    void fromBubbleSnapshot_throwsWhenConnectionsFieldMissing() throws Exception {
        JsonNode snapshot = objectMapper.readTree("""
                {
                  "bubbles": []
                }
                """);

        assertThatThrownBy(() -> mapper.fromBubbleSnapshot(UUID.randomUUID(), "sample", snapshot))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.FLOOR_PLAN_SNAPSHOT_CONVERSION_FAILED);
    }

    @Test
    void fromBubbleSnapshot_throwsWhenShapeIsMalformed() throws Exception {
        JsonNode snapshot = objectMapper.readTree("""
                {
                  "bubbles": {},
                  "connections": []
                }
                """);

        assertThatThrownBy(() -> mapper.fromBubbleSnapshot(UUID.randomUUID(), "sample", snapshot))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.FLOOR_PLAN_SNAPSHOT_CONVERSION_FAILED);
    }

    @Test
    void fromBubbleSnapshot_throwsWhenBubbleIdIsDuplicated() throws Exception {
        JsonNode snapshot = objectMapper.readTree("""
                {
                  "bubbles": [
                    {
                      "id": "bubble-1",
                      "x": 10.0,
                      "y": 20.0,
                      "width": 100.0,
                      "height": 80.0,
                      "widthMm": 2500.0,
                      "heightMm": 2000.0,
                      "label": "거실",
                      "type": "거실",
                      "ratio": 5.0,
                      "color": "#ffffff"
                    },
                    {
                      "id": "bubble-1",
                      "x": 40.0,
                      "y": 50.0,
                      "width": 120.0,
                      "height": 90.0,
                      "widthMm": 3600.0,
                      "heightMm": 2700.0,
                      "label": "방",
                      "type": "방",
                      "ratio": 9.0,
                      "color": "#ffffff"
                    }
                  ],
                  "connections": []
                }
                """);

        assertThatThrownBy(() -> mapper.fromBubbleSnapshot(UUID.randomUUID(), "sample", snapshot))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.FLOOR_PLAN_SNAPSHOT_CONVERSION_FAILED);
    }

    @Test
    void fromBubbleSnapshot_throwsWhenConnectionReferencesUnknownBubble() throws Exception {
        JsonNode snapshot = objectMapper.readTree("""
                {
                  "bubbles": [
                    {
                      "id": "bubble-1",
                      "x": 10.0,
                      "y": 20.0,
                      "width": 100.0,
                      "height": 80.0,
                      "widthMm": 2500.0,
                      "heightMm": 2000.0,
                      "label": "거실",
                      "type": "거실",
                      "ratio": 5.0,
                      "color": "#ffffff"
                    }
                  ],
                  "connections": [
                    {
                      "from": "bubble-1",
                      "to": "bubble-2",
                      "type": "thin"
                    }
                  ]
                }
                """);

        assertThatThrownBy(() -> mapper.fromBubbleSnapshot(UUID.randomUUID(), "sample", snapshot))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.FLOOR_PLAN_SNAPSHOT_CONVERSION_FAILED);
    }

    @Test
    void fromBubbleSnapshot_mapsUnknownRoomTypeToOther() throws Exception {
        JsonNode snapshot = objectMapper.readTree("""
                {
                  "bubbles": [
                    {
                      "id": "bubble-1",
                      "x": 10.0,
                      "y": 20.0,
                      "width": 100.0,
                      "height": 80.0,
                      "widthMm": 2500.0,
                      "heightMm": 2000.0,
                      "label": "테라스",
                      "type": "테라스",
                      "ratio": 5.0,
                      "color": "#ffffff"
                    }
                  ],
                  "connections": []
                }
                """);

        LayoutImportV2Payload payload = mapper.fromBubbleSnapshot(UUID.randomUUID(), "sample", snapshot);

        assertThat(payload.rooms()).singleElement().extracting(LayoutImportV2Payload.Room::type).isEqualTo("other");
    }

    @Test
    void fromBubbleSnapshot_throwsWhenDimensionsAreNonPositive() throws Exception {
        JsonNode snapshot = objectMapper.readTree("""
                {
                  "bubbles": [
                    {
                      "id": "bubble-1",
                      "x": 10.0,
                      "y": 20.0,
                      "width": 0.0,
                      "height": 80.0,
                      "widthMm": 2500.0,
                      "heightMm": 2000.0,
                      "label": "거실",
                      "type": "거실",
                      "ratio": 5.0,
                      "color": "#ffffff"
                    }
                  ],
                  "connections": []
                }
                """);

        assertThatThrownBy(() -> mapper.fromBubbleSnapshot(UUID.randomUUID(), "sample", snapshot))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.FLOOR_PLAN_SNAPSHOT_CONVERSION_FAILED);
    }

    @Test
    void fromBubbleSnapshot_mapsConnectionStrengths() throws Exception {
        JsonNode snapshot = objectMapper.readTree("""
                {
                  "bubbles": [
                    {
                      "id": "bubble-1",
                      "x": 10.0,
                      "y": 20.0,
                      "width": 100.0,
                      "height": 80.0,
                      "widthMm": 2500.0,
                      "heightMm": 2000.0,
                      "label": "거실",
                      "type": "거실",
                      "ratio": 5.0,
                      "color": "#ffffff"
                    },
                    {
                      "id": "bubble-2",
                      "x": 40.0,
                      "y": 50.0,
                      "width": 120.0,
                      "height": 90.0,
                      "widthMm": 3600.0,
                      "heightMm": 2700.0,
                      "label": "주방",
                      "type": "주방",
                      "ratio": 9.0,
                      "color": "#ffffff"
                    }
                  ],
                  "connections": [
                    {"from": "bubble-1", "to": "bubble-2", "type": "bold"},
                    {"from": "bubble-2", "to": "bubble-1", "type": "thin"},
                    {"from": "bubble-1", "to": "bubble-1", "type": "dashed"}
                  ]
                }
                """);

        LayoutImportV2Payload payload = mapper.fromBubbleSnapshot(UUID.randomUUID(), "sample", snapshot);

        assertThat(payload.adjacency()).extracting(LayoutImportV2Payload.Adjacency::strength)
                .containsExactly(1.0, 0.6, 0.3);
    }
}
