"""MinIO에서 현재 IFC를 다운받아 2층 거실을 추가한 뒤 같은 경로에 덮어씁니다.

Usage:
    uv run python AI/scripts/add_floor2_living_room.py \
        --project-id f05f0e18-93f8-48d2-b046-2fd519638648 \
        --revision-id 88875c8d-3f75-4d81-9292-d9983c47594d
"""
from __future__ import annotations

import argparse
import io
import json
import os
import sys
import tempfile
import uuid
from pathlib import Path

import boto3
import ifcopenshell
import ifcopenshell.guid
import ifcopenshell.api
import ifcopenshell.api.aggregate
import ifcopenshell.api.context
import ifcopenshell.api.geometry
import ifcopenshell.api.pset
import ifcopenshell.api.root
import ifcopenshell.api.spatial
import ifcopenshell.api.unit
import ifcopenshell.util.element

_BUCKET = "batang-artifacts"
_S3_ENDPOINT = os.environ.get("MINIO_ENDPOINT", "http://localhost:9000")
_S3_KEY = os.environ.get("MINIO_ACCESS_KEY", "minio")
_S3_SECRET = os.environ.get("MINIO_SECRET_KEY", "minio123")


def _s3_client():
    return boto3.client(
        "s3",
        endpoint_url=_S3_ENDPOINT,
        aws_access_key_id=_S3_KEY,
        aws_secret_access_key=_S3_SECRET,
        region_name="us-east-1",
    )


def _ifc_key(project_id: str, revision_id: str) -> str:
    return f"projects/{project_id}/revisions/{revision_id}/ifc/model.v1.ifc"


def _download_ifc(s3, project_id: str, revision_id: str, dest: Path) -> None:
    key = _ifc_key(project_id, revision_id)
    print(f"Downloading s3://{_BUCKET}/{key} ...")
    s3.download_file(_BUCKET, key, str(dest))
    print(f"  → {dest} ({dest.stat().st_size} bytes)")


def _upload_ifc(s3, project_id: str, revision_id: str, src: Path) -> None:
    key = _ifc_key(project_id, revision_id)
    print(f"Uploading {src} ({src.stat().st_size} bytes) → s3://{_BUCKET}/{key} ...")
    s3.upload_file(str(src), _BUCKET, key, ExtraArgs={"ContentType": "application/x-step"})
    print("  Done.")


def _find_or_create_2f_storey(
    ifc: ifcopenshell.file,
    building,
    elevation_mm: float,
) -> tuple[object, bool]:
    """2층 IfcBuildingStorey를 찾거나 새로 만든다. (storey, created) 반환."""
    storeys = ifc.by_type("IfcBuildingStorey")
    storeys_sorted = sorted(storeys, key=lambda s: getattr(s, "Elevation", 0) or 0)

    # 가장 낮은 층이 1층이므로 2번째 이상이 2층 후보
    # 이미 2개 이상의 층이 있으면 두 번째를 사용
    if len(storeys_sorted) >= 2:
        print(f"  기존 2층 발견: {storeys_sorted[1].GlobalId}")
        return storeys_sorted[1], False

    # 1층만 있으면 2층을 추가
    elevation_m = elevation_mm / 1000.0
    storey_2f = ifcopenshell.api.root.create_entity(ifc, ifc_class="IfcBuildingStorey")
    storey_2f.Name = "2F"
    storey_2f.LongName = "2층"
    storey_2f.Elevation = elevation_m
    storey_2f.CompositionType = "ELEMENT"

    # 동일 IfcLocalPlacement 복사 (간단하게 1층 placement 참조)
    base_storey = storeys_sorted[0]
    if base_storey.ObjectPlacement:
        # 간단히 2층 위치를 1층 placement 재사용 (elevation으로 구분)
        pass

    # building에 aggregate
    ifcopenshell.api.aggregate.assign_object(
        ifc,
        products=[storey_2f],
        relating_object=building,
    )
    print(f"  새 2층 스토리 생성: {storey_2f.GlobalId}")
    return storey_2f, True


def _find_1f_living_room(ifc: ifcopenshell.file, storey_1f) -> object | None:
    """1층에서 거실 공간을 찾는다."""
    for rel in ifc.by_type("IfcRelContainedInSpatialStructure"):
        if rel.RelatingStructure != storey_1f:
            continue
        for el in rel.RelatedElements:
            if not el.is_a("IfcSpace"):
                continue
            name = (getattr(el, "LongName", None) or getattr(el, "Name", None) or "").strip()
            if "거실" in name or name.lower() in ("living", "wohnzimmer"):
                return el
    return None


def _get_pset_dims(space) -> dict:
    psets = ifcopenshell.util.element.get_psets(space)
    return psets.get("Batang_SpaceDimensions", {})


def _add_pset_to_space(ifc: ifcopenshell.file, space, dims: dict) -> None:
    pset = ifcopenshell.api.pset.add_pset(ifc, product=space, name="Batang_SpaceDimensions")
    props: dict = {}
    for k, v in dims.items():
        if isinstance(v, bool):
            props[k] = v
        elif isinstance(v, (int, float)):
            props[k] = v
        elif isinstance(v, str):
            try:
                props[k] = int(v)
            except ValueError:
                try:
                    props[k] = float(v)
                except ValueError:
                    props[k] = v
        else:
            props[k] = v
    ifcopenshell.api.pset.edit_pset(ifc, pset=pset, properties=props)


def _create_2f_living_room(
    ifc: ifcopenshell.file,
    storey_2f,
    ref_space,
    owner_history,
) -> object:
    """2층 거실 IfcSpace를 생성하고 storey_2f에 배치한다."""
    space = ifcopenshell.api.root.create_entity(ifc, ifc_class="IfcSpace")
    space.Name = "거실"
    space.LongName = "거실"
    space.PredefinedType = "INTERNAL"
    space.OwnerHistory = owner_history

    # 1층 거실의 Batang_SpaceDimensions Pset 복사
    dims = _get_pset_dims(ref_space) if ref_space else {}
    if not dims:
        # 기본 크기
        dims = {"Width": 6000, "Height": 5000}
    else:
        # 위치를 약간 옮겨 겹치지 않도록
        dims = dict(dims)

    _add_pset_to_space(ifc, space, dims)

    # storey에 포함 — IfcRelContainedInSpatialStructure 직접 생성
    rel = ifc.createIfcRelContainedInSpatialStructure(
        ifcopenshell.guid.new(),
        owner_history,
        None,
        None,
        [space],
        storey_2f,
    )
    print(f"  2층 거실 생성: {space.GlobalId} (width={dims.get('Width')}, height={dims.get('Height')})")
    return space


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-id", required=True)
    parser.add_argument("--revision-id", required=True)
    parser.add_argument("--dry-run", action="store_true", help="Upload 없이 로컬에만 저장")
    parser.add_argument("--output", default=None, help="저장할 경로 (기본: 임시파일)")
    args = parser.parse_args()

    s3 = _s3_client()

    with tempfile.TemporaryDirectory(prefix="batang-ifc-") as tmpdir:
        tmp = Path(tmpdir)
        src = tmp / "original.ifc"
        dest = Path(args.output) if args.output else tmp / "modified.ifc"

        _download_ifc(s3, args.project_id, args.revision_id, src)

        ifc = ifcopenshell.open(str(src))
        print(f"IFC schema: {ifc.schema}")
        storeys = ifc.by_type("IfcBuildingStorey")
        print(f"기존 스토리 수: {len(storeys)}")
        for s in storeys:
            print(f"  - {s.GlobalId}  name={s.Name}  elev={getattr(s,'Elevation',None)}")

        spaces = ifc.by_type("IfcSpace")
        print(f"기존 공간 수: {len(spaces)}")
        for sp in spaces:
            name = getattr(sp, "LongName", None) or getattr(sp, "Name", None)
            print(f"  - {sp.GlobalId}  name={name}")

        buildings = ifc.by_type("IfcBuilding")
        if not buildings:
            print("ERROR: IfcBuilding 없음")
            sys.exit(1)
        building = buildings[0]

        storeys_sorted = sorted(storeys, key=lambda s: getattr(s, "Elevation", 0) or 0)
        storey_1f = storeys_sorted[0]
        elevation_1f = getattr(storey_1f, "Elevation", 0) or 0
        elevation_2f_m = elevation_1f + 3.0  # 3m 위

        storey_2f, created = _find_or_create_2f_storey(ifc, building, elevation_2f_m * 1000)
        if created:
            storey_2f.Elevation = elevation_2f_m

        # 1층 거실 참조 (Pset 복사용)
        ref_space = _find_1f_living_room(ifc, storey_1f)
        print(f"1층 거실 참조: {ref_space.GlobalId if ref_space else '없음'}")

        owner_history = ifc.by_type("IfcOwnerHistory")[0] if ifc.by_type("IfcOwnerHistory") else None

        # 2층에 이미 거실이 있으면 스킵
        existing_2f_spaces = []
        for rel in ifc.by_type("IfcRelContainedInSpatialStructure"):
            if rel.RelatingStructure != storey_2f:
                continue
            for el in rel.RelatedElements:
                if el.is_a("IfcSpace"):
                    existing_2f_spaces.append(el)

        living_exists = any(
            "거실" in (getattr(sp, "LongName", None) or getattr(sp, "Name", None) or "")
            for sp in existing_2f_spaces
        )

        if living_exists:
            print("2층 거실이 이미 있습니다. 스킵.")
        else:
            _create_2f_living_room(ifc, storey_2f, ref_space, owner_history)

        ifc.write(str(dest))
        print(f"수정된 IFC 저장: {dest} ({dest.stat().st_size} bytes)")

        # 검증
        ifc2 = ifcopenshell.open(str(dest))
        print("검증 - 공간 목록:")
        for sp in ifc2.by_type("IfcSpace"):
            name = getattr(sp, "LongName", None) or getattr(sp, "Name", None)
            print(f"  {sp.GlobalId}  {name}")

        if not args.dry_run:
            _upload_ifc(s3, args.project_id, args.revision_id, dest)
        else:
            print("dry-run: upload 생략. 결과 파일:", dest)
            if not args.output:
                # tmpdir 삭제 전에 복사
                import shutil
                out = Path("modified_test.ifc")
                shutil.copy(dest, out)
                print(f"  복사됨: {out}")


if __name__ == "__main__":
    main()
