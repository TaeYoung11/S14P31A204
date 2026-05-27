def shape_to_rects(shape: str, width: int, height: int) -> list[dict]:
    """shape과 치수(mm)를 rect 조합 리스트로 변환한다.

    반환값: [{"x": int, "y": int, "width": int, "height": int}, ...]
    홀수 치수는 마지막 rect가 나머지를 흡수한다.
    호출 전 validator.MIN_DIM_MM(500mm) 이상이 보장되어야 한다.
    """
    w, h = width, height

    if shape == "rect":
        return [{"x": 0, "y": 0, "width": w, "height": h}]

    if shape == "L":
        half_h = h // 2
        return [
            {"x": 0, "y": 0,      "width": w,      "height": half_h},
            {"x": 0, "y": half_h, "width": w // 2, "height": h - half_h},
        ]

    if shape == "U":
        quarter_w = w // 4
        return [
            {"x": 0,             "y": 0, "width": quarter_w,         "height": h},
            {"x": w - quarter_w, "y": 0, "width": quarter_w,         "height": h},
            {"x": quarter_w,     "y": 0, "width": w - 2 * quarter_w, "height": h // 3},
        ]

    return [{"x": 0, "y": 0, "width": w, "height": h}]
"""2D 계획 처리 전반에서 공통으로 쓰는 좌표·도형 보조 함수를 제공한다."""
