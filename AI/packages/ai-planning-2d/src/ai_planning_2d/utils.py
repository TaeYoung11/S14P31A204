def shape_to_rects(shape: str, width: int, height: int) -> list[dict]:
    """shape과 치수(mm)를 rect 조합 리스트로 변환한다.

    반환값: [{"x": int, "y": int, "width": int, "height": int}, ...]
    홀수 치수는 마지막 rect가 나머지를 흡수한다.
    L/U shape의 최소 치수 요건: L은 width/height >= 2, U는 width >= 4.
    요건 미달 시 rect로 폴백한다.
    """
    w, h = width, height

    if shape == "rect":
        return [{"x": 0, "y": 0, "width": w, "height": h}]

    if shape == "L":
        if w < 2 or h < 2:
            return [{"x": 0, "y": 0, "width": w, "height": h}]
        half_h = h // 2
        return [
            {"x": 0, "y": 0,      "width": w,      "height": half_h},
            {"x": 0, "y": half_h, "width": w // 2, "height": h - half_h},
        ]

    if shape == "U":
        if w < 4 or h < 3:
            return [{"x": 0, "y": 0, "width": w, "height": h}]
        quarter_w = w // 4
        return [
            {"x": 0,             "y": 0, "width": quarter_w,         "height": h},
            {"x": w - quarter_w, "y": 0, "width": quarter_w,         "height": h},
            {"x": quarter_w,     "y": 0, "width": w - 2 * quarter_w, "height": h // 3},
        ]

    return [{"x": 0, "y": 0, "width": w, "height": h}]
