package com.a204.batang.domain.workspace.repository;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

/**
 * 프로젝트별 버블/도면 스냅샷 히스토리를 Redis에 저장/조회한다.
 */
@Repository
@RequiredArgsConstructor
public class WorkspaceBubbleSnapshotRedisRepository {

    private static final String BUBBLE_SNAPSHOT_HISTORY_KEY_TEMPLATE = "workspace:project:%s:bubble:snapshots";
    private static final String FLOOR_PLAN_SNAPSHOT_HISTORY_KEY_TEMPLATE = "workspace:project:%s:floor-plan:snapshots";
    private static final int MAX_SNAPSHOT_HISTORY_SIZE = 10;
    private static final RedisScript<Long> SAVE_HISTORY_SCRIPT = RedisScript.of("""
            local historyKey = KEYS[1]
            local snapshotPayload = ARGV[1]
            local maxHistorySize = tonumber(ARGV[2])
            local baseIndex = tonumber(ARGV[3])

            if baseIndex == nil then
                return -1
            end

            local currentSize = redis.call('LLEN', historyKey)
            if currentSize == 0 then
                if baseIndex ~= -1 then
                    return -1
                end
            else
                if baseIndex < -1 or baseIndex >= currentSize then
                    return -1
                end

                if baseIndex == -1 then
                    redis.call('DEL', historyKey)
                else
                    redis.call('LTRIM', historyKey, 0, baseIndex)
                end
            end

            redis.call('RPUSH', historyKey, snapshotPayload)
            redis.call('LTRIM', historyKey, -maxHistorySize, -1)
            return 1
            """, Long.class);

    private final RedisTemplate<String, String> redisTemplate;
    private final ObjectMapper objectMapper;

    /**
     * 버블 다이어그램 스냅샷을 히스토리에 저장한다.
     *
     * @param projectId 프로젝트 ID
     * @param snapshot 스냅샷 JSON
     * @param baseIndex 클라이언트가 기준으로 사용한 현재 히스토리 인덱스
     * @throws JsonProcessingException JSON 직렬화 실패 시
     */
    public void saveSnapshot(UUID projectId, JsonNode snapshot, int baseIndex) throws JsonProcessingException {
        String key = BUBBLE_SNAPSHOT_HISTORY_KEY_TEMPLATE.formatted(projectId);
        saveSnapshotByKey(key, snapshot, baseIndex);
    }

    /**
     * 2D/3D 도면 스냅샷을 히스토리에 저장한다.
     *
     * @param projectId 프로젝트 ID
     * @param snapshot 스냅샷 JSON
     * @param baseIndex 클라이언트가 기준으로 사용한 현재 히스토리 인덱스
     * @throws JsonProcessingException JSON 직렬화 실패 시
     */
    public void saveFloorPlanSnapshot(UUID projectId, JsonNode snapshot, int baseIndex) throws JsonProcessingException {
        String key = FLOOR_PLAN_SNAPSHOT_HISTORY_KEY_TEMPLATE.formatted(projectId);
        saveSnapshotByKey(key, snapshot, baseIndex);
    }

    /**
     * 버블 스냅샷 히스토리 크기를 조회한다.
     *
     * @param projectId 프로젝트 ID
     * @return 현재 히스토리 크기
     */
    public int getBubbleSnapshotHistorySize(UUID projectId) {
        String key = BUBBLE_SNAPSHOT_HISTORY_KEY_TEMPLATE.formatted(projectId);
        return getSnapshotHistorySizeByKey(key);
    }

    /**
     * 버블 스냅샷 히스토리의 특정 인덱스 데이터를 조회한다.
     *
     * @param projectId 프로젝트 ID
     * @param index 조회 인덱스
     * @return 스냅샷 JSON, 없으면 {@code null}
     * @throws JsonProcessingException JSON 역직렬화 실패 시
     */
    public JsonNode findBubbleSnapshotByIndex(UUID projectId, int index) throws JsonProcessingException {
        String key = BUBBLE_SNAPSHOT_HISTORY_KEY_TEMPLATE.formatted(projectId);
        return findSnapshotByIndex(key, index);
    }

    /**
     * 2D/3D 도면 스냅샷 히스토리 크기를 조회한다.
     *
     * @param projectId 프로젝트 ID
     * @return 현재 히스토리 크기
     */
    public int getFloorPlanSnapshotHistorySize(UUID projectId) {
        String key = FLOOR_PLAN_SNAPSHOT_HISTORY_KEY_TEMPLATE.formatted(projectId);
        return getSnapshotHistorySizeByKey(key);
    }

    /**
     * 2D/3D 도면 스냅샷 히스토리의 특정 인덱스 데이터를 조회한다.
     *
     * @param projectId 프로젝트 ID
     * @param index 조회 인덱스
     * @return 스냅샷 JSON, 없으면 {@code null}
     * @throws JsonProcessingException JSON 역직렬화 실패 시
     */
    public JsonNode findFloorPlanSnapshotByIndex(UUID projectId, int index) throws JsonProcessingException {
        String key = FLOOR_PLAN_SNAPSHOT_HISTORY_KEY_TEMPLATE.formatted(projectId);
        return findSnapshotByIndex(key, index);
    }

    private void saveSnapshotByKey(String key, JsonNode snapshot, int baseIndex) throws JsonProcessingException {
        String serializedSnapshot = objectMapper.writeValueAsString(snapshot);

        Long result = redisTemplate.execute(
                SAVE_HISTORY_SCRIPT,
                List.of(key),
                serializedSnapshot,
                String.valueOf(MAX_SNAPSHOT_HISTORY_SIZE),
                String.valueOf(baseIndex)
        );

        if (result == null) {
            throw new IllegalStateException("Redis 히스토리 저장 결과를 받을 수 없습니다.");
        }

        if (result == -1L) {
            throw new IllegalArgumentException("Undo/Redo 기준 인덱스가 현재 히스토리와 일치하지 않습니다.");
        }
    }

    private int getSnapshotHistorySizeByKey(String key) {
        Long size = redisTemplate.opsForList().size(key);
        if (size == null) {
            return 0;
        }
        return size.intValue();
    }

    private JsonNode findSnapshotByIndex(String key, int index) throws JsonProcessingException {
        String snapshotPayload = redisTemplate.opsForList().index(key, index);
        if (snapshotPayload == null) {
            return null;
        }
        return objectMapper.readTree(snapshotPayload);
    }
}
