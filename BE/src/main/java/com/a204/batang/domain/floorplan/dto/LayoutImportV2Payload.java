package com.a204.batang.domain.floorplan.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
@Schema(description = "IFC Generate Worker로 전달할 layout_import_v2 payload DTO입니다.")
public record LayoutImportV2Payload(
        @JsonProperty("schema_version")
        @NotBlank
        @Pattern(regexp = "v2")
        @Schema(description = "레이아웃 스키마 버전입니다. 현재는 v2만 허용합니다.", example = "v2")
        String schemaVersion,

        @NotBlank
        @Schema(description = "프로젝트 식별자입니다.", example = "550e8400-e29b-41d4-a716-446655440000")
        String id,

        @NotBlank
        @Size(max = 255)
        @Schema(description = "프로젝트 이름입니다.", example = "sample-project")
        String name,

        @NotEmpty
        @Schema(description = "공간 목록입니다.")
        List<@Valid Room> rooms,

        @Schema(description = "존 목록입니다. snapshot fallback 경로에서는 값이 없으면 생략됩니다.")
        List<@Valid Zone> zones,

        @Schema(description = "공간 인접 관계 목록입니다.")
        List<@Valid Adjacency> adjacency,

        @Schema(description = "외곽 경계 목록입니다. snapshot fallback 경로에서는 값이 없으면 생략됩니다.")
        List<@Valid Boundary> boundaries,

        @JsonProperty("generation_options")
        @Valid
        @Schema(description = "생성 옵션입니다.")
        GenerationOptions generationOptions,

        @JsonProperty("modeling_defaults")
        @Valid
        @Schema(description = "모델링 기본값입니다. source에 없으면 생략됩니다.")
        ModelingDefaults modelingDefaults,

        @JsonProperty("generation_policy")
        @Valid
        @Schema(description = "생성 정책입니다.")
        GenerationPolicy generationPolicy
) {
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Room(
            @NotBlank
            @Size(max = 128)
            @Schema(description = "공간 식별자입니다.")
            String id,

            @JsonProperty("source_bubble_id")
            @Size(max = 128)
            @Schema(description = "Source bubble id preserved for downstream authoring.")
            String sourceBubbleId,

            @JsonProperty("original_label")
            @Size(max = 255)
            @Schema(description = "Original FE label before canonical mapping.")
            String originalLabel,

            @JsonProperty("original_type")
            @Size(max = 128)
            @Schema(description = "Original FE room type before canonical mapping.")
            String originalType,

            @NotBlank
            @Size(max = 255)
            @Schema(description = "공간 이름입니다.")
            String name,

            @NotBlank
            @Pattern(regexp = "living|bedroom|kitchen|bathroom|office|entrance|corridor|other")
            @Schema(description = "정규화된 공간 타입입니다.", example = "living")
            String type,

            @NotNull
            @Positive
            @Schema(description = "공간 너비(mm)입니다.", example = "4200")
            Integer width,

            @NotNull
            @Positive
            @Schema(description = "공간 높이(mm)입니다.", example = "3800")
            Integer height,

            @NotNull
            @Min(1)
            @Schema(description = "층 번호입니다.", example = "1")
            Integer floor,

            @NotNull
            @Schema(description = "공간 중심 x 좌표(mm)입니다.", example = "5000.0")
            Double x,

            @NotNull
            @Schema(description = "공간 중심 y 좌표(mm)입니다.", example = "4000.0")
            Double y,

            @NotNull
            @Schema(description = "공간 회전 각도입니다.", example = "0.0")
            Double angle,

            @NotNull
            @Schema(description = "공간 고정 여부입니다.", example = "false")
            Boolean locked,

            @Size(max = 128)
            @Schema(description = "Primary room material preserved from FE.")
            String material,

            @Pattern(regexp = "^#[0-9A-Fa-f]{6}$")
            @Schema(description = "Room color preserved from FE.", example = "#FF5733")
            String color,

            @JsonProperty("wall_type")
            @Pattern(regexp = "general|exterior|load_bearing|partition")
            @Schema(description = "Default wall intent around this room.")
            String wallType,

            @JsonProperty("zoneId")
            @Size(max = 128)
            @Schema(description = "존 식별자입니다. 없으면 null입니다.")
            String zoneId
    ) {
        public Room(
                String id,
                String name,
                String type,
                Integer width,
                Integer height,
                Integer floor,
                Double x,
                Double y,
                Double angle,
                Boolean locked,
                String zoneId
        ) {
            this(id, null, null, null, name, type, width, height, floor, x, y, angle, locked, null, null, null, zoneId);
        }
    }

    public record Zone(
            @NotBlank
            @Size(max = 128)
            @Schema(description = "존 식별자입니다.")
            String id,

            @NotBlank
            @Size(max = 255)
            @Schema(description = "존 이름입니다.")
            String name,

            @NotBlank
            @Pattern(regexp = "^#[0-9A-Fa-f]{6}$")
            @Schema(description = "존 색상입니다.", example = "#FF5733")
            String color,

            @Min(1)
            @Schema(description = "층 번호입니다. 없으면 room.floor를 통해 해석됩니다.", example = "1")
            Integer floor
    ) {
    }

    public record Adjacency(
            @Size(max = 128)
            @Schema(description = "Source connection id preserved for opening inference.")
            String id,

            @JsonProperty("from_room_id")
            @NotBlank
            @Size(max = 128)
            @Schema(description = "출발 공간 식별자입니다.")
            String fromRoomId,

            @JsonProperty("to_room_id")
            @NotBlank
            @Size(max = 128)
            @Schema(description = "도착 공간 식별자입니다.")
            String toRoomId,

            @NotNull
            @DecimalMin("0.0")
            @DecimalMax("1.0")
            @Schema(description = "인접 강도입니다.", example = "1.0")
            Double strength,

            @Pattern(regexp = "circulation|open_passage|weak_relation|merge")
            @Schema(description = "Connection intent for downstream opening inference.")
            String intent,

            @JsonProperty("connection_strength")
            @Pattern(regexp = "strong|normal|weak")
            @Schema(description = "Named connection strength.")
            String connectionStrength,

            @JsonProperty("source_bubble_id")
            @Size(max = 128)
            @Schema(description = "Source bubble id for the connection start.")
            String sourceBubbleId,

            @JsonProperty("target_bubble_id")
            @Size(max = 128)
            @Schema(description = "Source bubble id for the connection end.")
            String targetBubbleId
    ) {
        public Adjacency(String fromRoomId, String toRoomId, Double strength) {
            this(null, fromRoomId, toRoomId, strength, null, null, null, null);
        }
    }

    public record Boundary(
            @NotNull
            @Min(1)
            @Schema(description = "층 번호입니다.", example = "1")
            Integer floor,

            @NotEmpty
            @Schema(description = "외곽 폴리곤 좌표 목록입니다.")
            List<@Valid CoordinatePair> polygon
    ) {
    }

    @JsonFormat(shape = JsonFormat.Shape.ARRAY)
    @JsonPropertyOrder({"x", "y"})
    @Schema(type = "array", example = "[0.0, 0.0]", description = "좌표 쌍 [x, y]입니다.")
    public record CoordinatePair(
            @NotNull Double x,
            @NotNull Double y
    ) {
    }

    public record GenerationOptions(
            @JsonProperty("generate_spaces")
            @Schema(description = "공간 생성 여부입니다.", example = "true")
            Boolean generateSpaces,

            @JsonProperty("generate_walls")
            @Schema(description = "벽 생성 여부입니다.", example = "true")
            Boolean generateWalls,

            @JsonProperty("generate_slabs")
            @Schema(description = "슬래브 생성 여부입니다.", example = "true")
            Boolean generateSlabs,

            @JsonProperty("generate_roof")
            @Schema(description = "지붕 생성 여부입니다.", example = "true")
            Boolean generateRoof,

            @JsonProperty("generate_openings")
            @Schema(description = "개구부 생성 여부입니다.", example = "false")
            Boolean generateOpenings
    ) {
    }

    public record ModelingDefaults(
            @JsonProperty("space_height_mm")
            @Positive
            @Schema(description = "기본 공간 높이(mm)입니다.")
            Integer spaceHeightMm,

            @JsonProperty("wall_thickness_mm")
            @Positive
            @Schema(description = "기본 벽 두께(mm)입니다.")
            Integer wallThicknessMm,

            @JsonProperty("slab_thickness_mm")
            @Positive
            @Schema(description = "기본 슬래브 두께(mm)입니다.")
            Integer slabThicknessMm,

            @JsonProperty("roof_height_mm")
            @Positive
            @Schema(description = "기본 지붕 높이(mm)입니다.")
            Integer roofHeightMm
    ) {
    }

    public record GenerationPolicy(
            @JsonProperty("boundary_wall_mode")
            @Pattern(regexp = "outer_boundary")
            @Schema(description = "외곽 벽 생성 정책입니다.", example = "outer_boundary")
            String boundaryWallMode,

            @JsonProperty("shared_wall_policy")
            @Pattern(regexp = "from_adjacency")
            @Schema(description = "공유 벽 생성 정책입니다.", example = "from_adjacency")
            String sharedWallPolicy,

            @JsonProperty("roof_shape")
            @Pattern(regexp = "flat")
            @Schema(description = "지붕 형태 정책입니다.", example = "flat")
            String roofShape
    ) {
    }
}
