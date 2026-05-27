# IFCContext 스키마 정의

BE가 2D_LLM에 넘기는 현재 IFC 상태 스냅샷.
LLM은 이 컨텍스트를 읽고 자연어 명령을 해석하여 IFCCommand 배치를 반환한다.

---

## 전체 구조

```python
class IFCContext(TypedDict):
    spaces:     list[SpaceContext]
    adjacency:  list[AdjacencyContext]
    walls:      list[WallContext]
    doors:      list[DoorContext]
    windows:    list[WindowContext]
    boundaries: list[BoundaryContext]
    storeys:    list[StoreyContext]
```

---

## 각 스키마 정의

### SpaceContext

```python
class SpaceContext(TypedDict):
    id:      str                                   # IFC GlobalId
    name:    str                                   # 방 이름 (예: "거실")
    type:    str                                   # "living" | "bedroom" | "kitchen" | "bathroom" | "office" | "corridor" | "other"
    floor:   int                                   # 층 번호 (1부터 시작)
    polygon: list[tuple[float, float]]             # mm — 정본(canonical). L/U shape 포함 실제 형상
    width:   int | None                            # mm, polygon bounding box 너비 (파생값, LLM 단순 크기 파악용)
    height:  int | None                            # mm, polygon bounding box 높이 (파생값)
    x:       float | None                          # mm — polygon bounding box 최솟값 x (파생값)
    y:       float | None                          # mm — polygon bounding box 최솟값 y (파생값)
    angle:   float | None                          # degree, IFC LocalPlacement 회전각 (파생값)
    locked:  bool                                  # True면 LLM이 수정/삭제 명령 생성 금지
    zone_id: str | None                            # 존 GlobalId (공간은 하나의 존에만 속함)
```

**기하 정본**: `polygon`이 실제 형상의 유일한 출처다. `width`/`height`/`x`/`y`/`angle`은 파생값이며,
LLM이 단순 크기나 위치를 파악할 때 polygon 파싱 없이 읽기 위해 함께 제공한다.
두 값이 충돌하면 `polygon`을 기준으로 한다.

**polygon 포함 이유**: IFC는 공간을 polygon으로 저장한다. 프론트도 IFC 파일에서 직접 polygon을 읽어 2D로 변환하므로,
IFCContext는 동일한 polygon을 그대로 전달해야 한다.

**polygon 직렬화 규칙**:
- **open ring**: 첫 점을 마지막에 반복하지 않는다. `[[0,0],[5,0],[5,4],[0,4]]` (4점, 닫힌 반복 없음)
- **winding order**: CCW (반시계 방향). IFC world 좌표계 기준 (x→오른쪽, y→위쪽)
- **collinear 점 금지**: 연속한 세 점이 일직선인 중복점은 제거한다. `[A, B, C]`에서 B가 AC 위에 있으면 B를 생략
- 최소 3점, self-intersection 없음

---

### AdjacencyContext

```python
class AdjacencyContext(TypedDict):
    space_a_id: str    # IFC GlobalId (GlobalId 사전순으로 항상 a < b)
    space_b_id: str    # IFC GlobalId
    strength:   float  # 0.0~1.0
```

**무방향 관계**: 인접은 방향이 없다. (A,B)와 (B,A)는 같은 관계이므로 한 쌍에 항목 1개만 존재한다.
저장 순서 규칙: `space_a_id < space_b_id` (GlobalId 문자열 사전순). BE 추출 시 반드시 정렬 후 저장한다.

**strength 정의**: 버블 다이어그램 단계에서 설계자가 지정한 인접 중요도.
1.0 = 반드시 붙어야 함, 0.0 = 인접 불필요.
문/벽 존재 여부와 무관한 설계 의도값이며 배치 최적화 힌트로만 사용한다.

---

### WallContext

```python
class WallContext(TypedDict):
    id:        str                      # IFC GlobalId
    floor:     int
    start:     tuple[float, float]      # mm
    end:       tuple[float, float]      # mm
    thickness: int                      # mm
    space_ids: list[str]                # 이 벽을 공유하는 Space GlobalId 목록
    kind:      str | None               # "EXTERIOR" | "INTERIOR" | "PARTITION" | None
```

**start/end 정규화 규칙 (BE 추출 시 반드시 적용)**:
`start`는 항상 좌표가 더 작은 점. x를 먼저 비교하고, x가 같으면 y를 비교한다.
```
start.x < end.x  또는
start.x == end.x and start.y < end.y
```
이 규칙이 없으면 동일한 벽도 추출할 때마다 start/end가 뒤집혀 position 오프셋 값이 달라진다.

**space_ids 카디널리티**: 외벽 = 1개, 내벽 = 2개. 0개는 유효하지 않다.

**kind 의미**: `scene_2d_snapshot_v1`의 `wall.kind`와 동일한 값. LLM이 외벽/내벽을 구분해 개구부 생성 규칙을 적용할 때 사용한다. IFC에서 추출하기 어려운 경우 None 허용.

---

### DoorContext

```python
class DoorContext(TypedDict):
    id:             str        # IFC GlobalId
    floor:          int
    host_wall_id:   str        # 부착된 벽 GlobalId (IFC parent_id와 동일)
    from_space_id:  str | None # 벽 법선 양(+)의 방향 공간 GlobalId
    to_space_id:    str | None # 벽 법선 음(-)의 방향 공간 GlobalId
    width:          int        # mm
    height:         int        # mm
    position:       int        # mm, wall.start 기준 문 중심까지의 오프셋
    opening_type:   str        # "swing" | "sliding"
    swing_into_id:  str | None # 문이 열려 들어가는 공간 GlobalId — swing만 해당, sliding은 None
    hinge_side:     str | None # "left" | "right" — sliding은 None
```

**from/to 기하 정의 (BE 추출 시 기준)**:
벽 법선 = wall (start→end) 방향 벡터를 반시계(CCW) 90° 회전한 벡터.
- `from_space_id`: 법선 양(+)의 방향에 있는 공간
- `to_space_id`: 법선 음(-)의 방향에 있는 공간

```
예) wall start=(5000,0), end=(5000,4000) → 방향벡터=(0,1) → CCW 90° → 법선=(-1,0) (서쪽)
    from_space_id = 서쪽 공간 (거실)
    to_space_id   = 동쪽 공간 (주방)
```

**from/to 추출 방법 (BE)**:
`IfcDoor → RelFillsElement → IfcOpeningElement → VoidsElements → IfcWall → RelSpaceBoundary → IfcSpace`
순으로 IFC 관계를 타고 가면 두 공간을 얻을 수 있다.

**opening 위치 정본 규칙 (position)**:
`position`은 `wall.start → wall.end` 방향을 따라 opening 중심점까지의 wall-local offset(mm)이다.
- 문 시작점 기준이 아닌 중심(center) 기준이므로 폭이 바뀌어도 위치값이 달라지지 않는다.
- LLM이 "문을 200mm 오른쪽으로 옮겨줘"를 `position += 200`으로 직접 처리할 수 있다.
- `IFCContext`에서 opening 위치의 유일한 정본(canonical)이다.
- 절대좌표 중심점이 필요하면 `host_wall_id + position + wall geometry`로 파생 계산하며, 충돌 시 `position`이 우선한다.

**opening_type + hinge_side 의미**:
- `"swing"` : 여닫이. `swing_into_id`가 문이 열려 들어가는 공간을 지정
- `"sliding"`: 미닫이. `swing_into_id = None`, `hinge_side = None`

**hinge_side 기준**: wall start→end 방향을 바라봤을 때 경첩이 있는 쪽.

---

### WindowContext

```python
class WindowContext(TypedDict):
    id:                str        # IFC GlobalId
    floor:             int
    host_wall_id:      str        # 부착된 벽 GlobalId
    adjacent_space_id: str | None # 창문이 속한 공간 GlobalId
    width:             int        # mm
    height:            int        # mm
    sill_height:       int        # mm, 바닥에서 창틀 하단까지
    position:          int        # mm, wall.start 기준 창문 중심까지의 오프셋
```

**범위 제한**: 현재 2D_LLM에서는 **외벽 창(exterior window)만 지원**한다.
`adjacent_space_id` 하나로 충분하며, 공간-공간 사이 내부 창은 이 스키마로 표현하지 않는다.

---

### BoundaryContext

```python
class BoundaryContext(TypedDict):
    floor:         int
    outer_polygon: list[tuple[float, float]]         # mm, 층 외곽선
    holes:         list[list[tuple[float, float]]]   # mm, 중정/빈 공간 등 내부 구멍 (없으면 [])
```

방 배치 시 바운더리 바깥에 공간을 생성하지 않도록 LLM 유효성 검증에 사용한다.
일반적인 단독주택은 holes=[]이지만, 중정이나 복잡한 외곽선을 가진 경우를 위해 holes를 포함한다.

**winding order 규칙**:
- `outer_polygon`: CCW (반시계 방향)
- `holes` 각 항목: CW (시계 방향) — outer와 반대 방향이어야 내부 구멍으로 인식된다
- open ring, collinear 점 제거 규칙은 SpaceContext.polygon과 동일하게 적용한다

---

### StoreyContext

```python
class StoreyContext(TypedDict):
    id:        str          # IFC GlobalId
    floor:     int
    elevation: float | None # mm, 해당 층의 절대 높이
```

---

## 단위 규칙

| 필드 | 단위 |
|------|------|
| 모든 좌표/치수 (polygon, outer_polygon, holes, start, end, x, y, width, height, thickness, position, sill_height, elevation) | 밀리미터 (mm) |
| 각도 (angle) | degree |
| 강도 (strength) | 0.0~1.0 |

---

## 교차 참조 제약 (BE 추출 및 LLM 검증 시 준수)

| 제약 | 설명 |
|------|------|
| ID 존재 | 모든 `*_id` 참조는 해당 리스트에 실제로 존재해야 함 |
| floor 일치 | door/window의 `floor`는 `host_wall_id`가 가리키는 wall의 `floor`와 같아야 함 |
| position 범위 | `position - width/2 >= 0` 이고 `position + width/2 <= wall_length` |
| space_ids 범위 | 외벽=1, 내벽=2. 0은 무효 |
| swing_into 범위 | `swing_into_id`는 반드시 `from_space_id` 또는 `to_space_id` 중 하나여야 함 |
| polygon 유효성 | open ring(첫 점 반복 없음), CCW, 최소 3점, self-intersection 없음, collinear 중복점 없음 |
| holes winding | `holes` 각 항목은 CW (outer_polygon CCW와 반대) |
| 공간 비겹침 | 같은 층의 Space polygon은 서로 겹치지 않아야 함 |

---

## LLM 사용 규칙

- `locked: true`인 Space에는 수정/삭제 IFCCommand를 생성하지 않는다.
- Door/Window 명령 생성 시 반드시 `host_wall_id`를 `parent_id`로 포함해야 한다.
- 방 추가 시 해당 층 `BoundaryContext.outer_polygon` 내부에 배치하고, `holes`와는 겹치지 않아야 한다.
- "거실과 주방 사이 문"처럼 공간 이름으로 문을 특정할 때: DoorContext의 `from_space_id` / `to_space_id`를 보고 해당 DoorContext를 찾는다.
- `swing_into_id`로 "안쪽으로 열리는 문" / "주방 쪽으로 열리는 문" 같은 방향 표현을 해석한다.
- 기하 충돌 여부는 `polygon`을 기준으로 판단하고, `width`/`height`는 보조 정보로만 사용한다.
