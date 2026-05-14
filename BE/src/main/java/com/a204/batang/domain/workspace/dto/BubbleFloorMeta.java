package com.a204.batang.domain.workspace.dto;

import java.util.List;
import java.util.Map;

/**
 * 버블 스냅샷의 층 메타 정보를 표현한다.
 *
 * @param namesByFloor 층 번호별 이름 맵
 * @param extraFloors 버블이 없는 추가 층 번호 목록
 */
public record BubbleFloorMeta(
        Map<Integer, String> namesByFloor,
        List<Integer> extraFloors
) {
}
