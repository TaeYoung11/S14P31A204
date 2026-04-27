"""Step 3: Open3D OffscreenRenderer 렌더 PoC.

IFC 파싱(Step 2 코드 재사용) → Open3D TriangleMesh → OffscreenRenderer로
정면/측면/조감 3뷰 PNG 저장. GPU/EGL 없이 Windows headless 동작 검증.

실행:
    uv run python scripts/step3_o3d_render.py
"""

import io
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import ifcopenshell
import ifcopenshell.geom
import numpy as np
import open3d as o3d
from PIL import Image

IFC_PATH = (
    Path(__file__).parent.parent
    / "packages/ai-rendering/tests/fixtures/ifc/AC-20-Smiley-West-10-Bldg.ifc"
)
OUTPUT_DIR = Path(__file__).parent.parent / "outputs"
W, H = 768, 448


def parse_ifc(ifc_path: Path) -> tuple[np.ndarray, np.ndarray]:
    model = ifcopenshell.open(str(ifc_path))
    settings = ifcopenshell.geom.settings()
    settings.set(settings.USE_WORLD_COORDS, True)
    settings.set(settings.WELD_VERTICES, True)

    vertices_list: list[np.ndarray] = []
    faces_list: list[np.ndarray] = []
    offset = 0

    iterator = ifcopenshell.geom.iterator(settings, model)
    if not iterator.initialize():
        raise RuntimeError("IFC: geometry 없음")

    while True:
        shape = iterator.get()
        geo = shape.geometry
        verts = np.array(geo.verts, dtype=np.float64).reshape(-1, 3)
        faces = np.array(geo.faces, dtype=np.int64).reshape(-1, 3) + offset
        vertices_list.append(verts)
        faces_list.append(faces)
        offset += len(verts)
        if not iterator.next():
            break

    return np.vstack(vertices_list), np.vstack(faces_list)


def build_mesh(vertices: np.ndarray, faces: np.ndarray) -> o3d.geometry.TriangleMesh:
    mesh = o3d.geometry.TriangleMesh()
    mesh.vertices = o3d.utility.Vector3dVector(vertices)
    mesh.triangles = o3d.utility.Vector3iVector(faces)
    mesh.compute_vertex_normals()
    return mesh


def render_view(
    mesh: o3d.geometry.TriangleMesh,
    front: list[float],
    up: list[float],
    center: np.ndarray,
    out_path: Path,
) -> Image.Image:
    """Visualizer(visible=False) + capture_screen_image 방식.

    OffscreenRenderer는 Windows에서 EGL을 요구해 실패하므로,
    native Win32 OpenGL context를 쓰는 Visualizer 대안을 사용.
    """
    vis = o3d.visualization.Visualizer()
    vis.create_window(visible=False, width=W, height=H)
    vis.add_geometry(mesh)

    opt = vis.get_render_option()
    opt.background_color = np.array([1.0, 1.0, 1.0])
    opt.light_on = True

    vc = vis.get_view_control()
    vc.set_front(front)
    vc.set_up(up)
    vc.set_lookat(center.tolist())
    vc.set_zoom(0.5)

    vis.poll_events()
    vis.update_renderer()
    vis.capture_screen_image(str(out_path), do_render=True)
    vis.destroy_window()

    return Image.open(out_path)


def main() -> None:
    print(f"파일: {IFC_PATH.name}")
    print("IFC 파싱 중...")
    vertices, faces = parse_ifc(IFC_PATH)
    print(f"  vertices: {len(vertices):,}  faces: {len(faces):,}")

    mesh = build_mesh(vertices, faces)

    aabb_min = vertices.min(axis=0)
    aabb_max = vertices.max(axis=0)
    center = (aabb_min + aabb_max) / 2
    extent = aabb_max - aabb_min

    print(f"  AABB center: {center.round(2).tolist()}")
    print(f"  extent:      {extent.round(2).tolist()}")

    # front/up은 Open3D ViewControl 기준: front = center→eye 방향 (정규화 불필요)
    views: dict[str, tuple[list[float], list[float]]] = {
        "front": ([-1.0,  0.0,  0.2], [0.0, 0.0, 1.0]),   # -X 방향에서 바라봄
        "side":  ([ 0.0, -1.0,  0.2], [0.0, 0.0, 1.0]),   # -Y 방향에서 바라봄
        "top":   ([-0.6, -0.6,  1.0], [0.0, 0.0, 1.0]),   # 조감
    }

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for view_name, (front, up) in views.items():
        print(f"\n  뷰: {view_name}  front={front}")
        out_path = OUTPUT_DIR / f"poc_step3_{view_name}.png"
        img = render_view(mesh, front, up, center, out_path)

        arr = np.asarray(img)
        print(f"  저장 -> {out_path.name}")
        print(f"  픽셀 통계: min={arr.min()}  max={arr.max()}  mean={arr.mean():.1f}")

    print("\n완료. outputs/ 폴더에서 PNG를 확인하세요.")


if __name__ == "__main__":
    main()
