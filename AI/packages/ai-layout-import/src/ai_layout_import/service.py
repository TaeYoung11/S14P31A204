"""layout import 서비스 진입점."""

from __future__ import annotations

from pathlib import Path

from ai_domain import LayoutImportV1


def convert_layout_to_ifc(request: LayoutImportV1, output_path: str | Path) -> None:
    """신규 IFC import 서비스의 공식 진입점.

    티켓 1에서는 패키지 경계와 함수 시그니처만 고정한다.
    실제 IFC 생성 구현은 티켓 2에서 추가한다.
    """

    _ = request, Path(output_path)
    raise NotImplementedError("티켓 1에서는 convert_layout_to_ifc 진입점만 고정합니다.")
