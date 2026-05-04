package com.a204.batang.domain.workspace.service;

import com.a204.batang.domain.workspace.dto.BubbleSnapshotPayload;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

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
                      "label": "거실",
                      "type": "거실",
                      "ratio": 5.0,
                      "color": "#ffffff"
                    }
                  ],
                  "connections": []
                }
                """);

        BubbleSnapshotPayload payload = helper.readSnapshotPayloadOrThrow(snapshot);

        assertThat(payload.bubbles()).hasSize(1);
        assertThat(payload.connections()).isEmpty();
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
}
