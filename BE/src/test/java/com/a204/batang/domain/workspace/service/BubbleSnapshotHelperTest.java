package com.a204.batang.domain.workspace.service;

import com.a204.batang.domain.workspace.dto.BubbleSnapshotPayload;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BubbleSnapshotHelperTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final BubbleSnapshotHelper helper = new BubbleSnapshotHelper(objectMapper);

    @Test
    void readSnapshotPayloadOrThrow_returnsPayloadWhenShapeIsValid() throws Exception {
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
                      "label": "living-room",
                      "type": "living",
                      "ratio": 5.0,
                      "color": "#ffffff"
                    }
                  ],
                  "connections": [],
                  "floorMeta": {
                    "namesByFloor": {
                      "1": "1F"
                    },
                    "extraFloors": [2]
                  }
                }
                """);

        BubbleSnapshotPayload payload = helper.readSnapshotPayloadOrThrow(snapshot);

        assertThat(payload.bubbles()).hasSize(1);
        assertThat(payload.bubbles().get(0).floor()).isEqualTo(1);
        assertThat(payload.connections()).isEmpty();
        assertThat(payload.floorMeta()).isNotNull();
        assertThat(payload.floorMeta().namesByFloor()).containsEntry(1, "1F");
        assertThat(payload.floorMeta().extraFloors()).containsExactly(2);
    }

    @Test
    void readSnapshotPayloadOrThrow_throwsWhenShapeIsMalformed() throws Exception {
        JsonNode snapshot = objectMapper.readTree("""
                {
                  "bubbles": {}
                }
                """);

        assertThatThrownBy(() -> helper.readSnapshotPayloadOrThrow(snapshot))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.FLOOR_PLAN_SNAPSHOT_CONVERSION_FAILED);
    }

    @Test
    void readSnapshotPayloadOrThrow_preservesZoneIdWhenZoneContainsMultipleFloors() throws Exception {
        JsonNode snapshot = snapshotWithZones("""
                  "zones": [
                    {
                      "id": "zone-1",
                      "name": "zone 1",
                      "color": "#3B45B3",
                      "bubbleIds": ["bubble-1", "bubble-2"],
                      "source": "manual"
                    }
                  ]
                """);

        BubbleSnapshotPayload payload = helper.readSnapshotPayloadOrThrow(snapshot);

        assertThat(payload.zones()).hasSize(1);
        assertThat(payload.zones().get(0).id()).isEqualTo("zone-1");
        assertThat(payload.zones().get(0).bubbleIds()).containsExactly("bubble-1", "bubble-2");
    }

    @Test
    void readSnapshotPayloadOrThrow_throwsWhenBubbleBelongsToMultipleZones() throws Exception {
        JsonNode snapshot = snapshotWithZones("""
                  "zones": [
                    {
                      "id": "zone-1",
                      "name": "zone 1",
                      "color": "#3B45B3",
                      "bubbleIds": ["bubble-1"],
                      "source": "manual"
                    },
                    {
                      "id": "zone-2",
                      "name": "zone 2",
                      "color": "#54A24B",
                      "bubbleIds": ["bubble-1"],
                      "source": "auto"
                    }
                  ]
                """);

        assertThatThrownBy(() -> helper.readSnapshotPayloadOrThrow(snapshot))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.WORKSPACE_BUBBLE_SNAPSHOT_INVALID);
    }

    @Test
    void readSnapshotPayloadOrThrow_throwsWhenZoneColorIsNotHexColor() throws Exception {
        for (String color : List.of("red", "#12345678", "123456")) {
            JsonNode snapshot = snapshotWithZones("""
                      "zones": [
                        {
                          "id": "zone-1",
                          "name": "zone 1",
                          "color": "%s",
                          "bubbleIds": ["bubble-1"],
                          "source": "manual"
                        }
                      ]
                    """.formatted(color));

            assertThatThrownBy(() -> helper.readSnapshotPayloadOrThrow(snapshot))
                    .isInstanceOf(CustomException.class)
                    .extracting("errorCode")
                    .isEqualTo(ErrorCode.WORKSPACE_BUBBLE_SNAPSHOT_INVALID);
        }
    }

    @Test
    void readSnapshotPayloadOrThrow_allowsMissingZoneSourceAndNormalizesBlankSourceToNull() throws Exception {
        JsonNode snapshot = snapshotWithZones("""
                  "zones": [
                    {
                      "id": "zone-1",
                      "name": "zone 1",
                      "color": "#3B45B3",
                      "bubbleIds": ["bubble-1"]
                    },
                    {
                      "id": "zone-2",
                      "name": "zone 2",
                      "color": "#54A24B",
                      "bubbleIds": ["bubble-2"],
                      "source": "   "
                    }
                  ]
                """);

        BubbleSnapshotPayload payload = helper.readSnapshotPayloadOrThrow(snapshot);

        assertThat(payload.zones()).hasSize(2);
        assertThat(payload.zones()).extracting("source").containsExactly(null, null);
    }

    @Test
    void readSnapshotPayloadOrThrow_throwsWhenZoneSourceIsInvalid() throws Exception {
        JsonNode snapshot = snapshotWithZones("""
                  "zones": [
                    {
                      "id": "zone-1",
                      "name": "zone 1",
                      "color": "#3B45B3",
                      "bubbleIds": ["bubble-1"],
                      "source": "system"
                    }
                  ]
                """);

        assertThatThrownBy(() -> helper.readSnapshotPayloadOrThrow(snapshot))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.WORKSPACE_BUBBLE_SNAPSHOT_INVALID);
    }

    private JsonNode snapshotWithZones(String zonesJson) throws Exception {
        return objectMapper.readTree("""
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
                      "label": "living-room",
                      "type": "living",
                      "ratio": 5.0,
                      "color": "#ffffff",
                      "floor": 1
                    },
                    {
                      "id": "bubble-2",
                      "x": 40.0,
                      "y": 50.0,
                      "width": 120.0,
                      "height": 90.0,
                      "widthMm": 3600.0,
                      "heightMm": 2700.0,
                      "label": "bedroom",
                      "type": "bedroom",
                      "ratio": 9.0,
                      "color": "#ffffff",
                      "floor": 2
                    }
                  ],
                  "connections": [],
                %s
                }
                """.formatted(zonesJson));
    }
}
