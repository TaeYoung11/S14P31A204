"""scripts 디렉터리의 보조 실행 스크립트 계약을 importlib로 검증한다.

이 테스트는 스크립트를 CLI로 직접 실행하지 않고 모듈로 로드해, 기본 경로/옵션/내부 helper가
production 연결에서 기대한 값을 유지하는지 확인한다. 특히 front diagonal auto-background 실험,
strip cleanup preset, ifc_to_styled.py의 semantic/auto-zoom 연결처럼 스크립트 기본값이
품질 회귀에 직접 영향을 주는 부분을 고정한다.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

import pytest

from ai_rendering.ifc2img.style import DEFAULT_CONTROLNET_SEG_ID

REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = REPO_ROOT / "scripts"


def _load_script(name: str) -> ModuleType:
    """`scripts/<name>`을 `__main__` 실행 없이 테스트용 모듈로 로드한다."""
    path = SCRIPTS_DIR / name
    spec = importlib.util.spec_from_file_location(f"_script_{name.replace('.py', '')}", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize(
    "script_name",
    ["run_diversity_inference.py", "run_diversity_check.py"],
)
def test_display_path_returns_relative_for_root_internal_path(script_name: str) -> None:
    """repo 내부 경로는 로그/출력에서 읽기 쉬운 상대 경로로 표시되어야 한다."""
    m = _load_script(script_name)

    inside = m.ROOT / "outputs" / "foo.png"
    result = m._display_path(inside)

    assert not result.is_absolute()
    assert result == Path("outputs") / "foo.png"


@pytest.mark.parametrize(
    "script_name",
    ["run_diversity_inference.py", "run_diversity_check.py"],
)
def test_display_path_returns_absolute_for_root_external_path(script_name: str) -> None:
    """repo 밖의 경로는 상대 경로 계산이 불가능하므로 절대 경로로 유지되어야 한다."""
    m = _load_script(script_name)

    outside = m.ROOT.parent.parent / "definitely_outside_repo_root_xyz" / "foo.png"
    result = m._display_path(outside)

    assert result == outside
    assert result.is_absolute()


@pytest.mark.parametrize(
    "script_name",
    ["run_diversity_inference.py", "run_diversity_check.py"],
)
def test_display_path_does_not_raise_value_error(script_name: str) -> None:
    """`relative_to`가 실패하는 외부 경로도 display helper에서 예외를 내지 않아야 한다."""
    m = _load_script(script_name)
    outside = Path("/some/absolute/external/path/foo.png").resolve()

    m._display_path(outside)


def test_front_diagonal_auto_background_mask_script_defaults_to_latest_smoke() -> None:
    """front diagonal auto-background mask preview 기본 입출력 경로를 확인한다."""
    m = _load_script("generate_front_diagonal_auto_background_masks.py")

    assert (
        m.DEFAULT_INPUT_DIR
        == m.ROOT
        / "outputs"
        / "ifc2img_front_diagonal_ground_extent_105_style_smoke1"
        / "AC20-FZK-Haus"
    )
    assert (
        m.DEFAULT_OUTPUT_DIR
        == m.ROOT
        / "outputs"
        / "ifc2img_front_diagonal_auto_background_mask_tight_preview1"
        / "AC20-FZK-Haus"
    )
    assert m.DEFAULT_PRESET == "korean_house"
    assert m.DEPTH_NAMES == ("depth_front_diagonal_right.png", "depth_front_diagonal_left.png")
    assert m.DEFAULT_PROTECT_EXPAND_PX == 5
    assert m.DEFAULT_TARGET_FEATHER_RADIUS == 4


def test_front_diagonal_auto_background_inpaint_script_defaults_to_korean_house_smoke() -> None:
    """front diagonal auto-background inpaint smoke 기본 경로와 옵션을 확인한다."""
    m = _load_script("run_front_diagonal_auto_background_inpaint.py")

    assert (
        m.DEFAULT_INPUT_DIR
        == m.ROOT
        / "outputs"
        / "ifc2img_front_diagonal_ground_extent_105_style_smoke1"
        / "AC20-FZK-Haus"
    )
    assert (
        m.DEFAULT_MASK_DIR
        == m.ROOT
        / "outputs"
        / "ifc2img_front_diagonal_auto_background_mask_tight_preview1"
        / "AC20-FZK-Haus"
    )
    assert (
        m.DEFAULT_OUTPUT_DIR
        == m.ROOT
        / "outputs"
        / "ifc2img_front_diagonal_auto_background_inpaint_smoke1"
        / "AC20-FZK-Haus"
    )
    assert m.DEFAULT_PRESET == "korean_house"
    assert m.DEFAULT_VIEWS == ("front_diagonal_right", "front_diagonal_left")
    assert m.DEFAULT_BACKGROUND_MODE == "guided"
    assert m.BACKGROUND_MODES == ("guided", "free")
    assert m.DEFAULT_STRENGTH == 0.55
    assert m.FRONT_DIAGONAL_STRIP_CLEANUP_BACKGROUND_MODE == "free"
    assert m.FRONT_DIAGONAL_STRIP_CLEANUP_BOTTOM_STRIP_RATIO == 0.10
    assert m.FRONT_DIAGONAL_STRIP_CLEANUP_BOTTOM_STRIP_PREFILL_MODE == "feather"
    assert m.FRONT_DIAGONAL_STRIP_CLEANUP_SECOND_PASS_BOTTOM_STRIP_RATIO == 0.28
    assert m.FRONT_DIAGONAL_STRIP_CLEANUP_SECOND_PASS_STRENGTH == 1.0
    assert m.FRONT_DIAGONAL_STRIP_CLEANUP_SECOND_PASS_FEATHER_RATIO == 0.45
    assert m.DEFAULT_BOTTOM_STRIP_RATIO == 0.10
    assert m.DEFAULT_BOTTOM_STRIP_PREFILL_MODE == "solid"
    assert m.BOTTOM_STRIP_PREFILL_MODES == ("solid", "feather")
    assert m.BOTTOM_STRIP_COLORS["neutral_paved"] == (134, 130, 120)
    assert m.DEFAULT_SECOND_PASS_BOTTOM_STRIP_RATIO == 0.16
    assert m.DEFAULT_SECOND_PASS_STRENGTH == 0.75
    assert "letters" in m.BOTTOM_STRIP_SECOND_PASS_NEGATIVE
    assert "logo" in m.BOTTOM_STRIP_SECOND_PASS_NEGATIVE
    assert "sign" in m.BOTTOM_STRIP_SECOND_PASS_NEGATIVE
    assert "caption" in m.BOTTOM_STRIP_SECOND_PASS_NEGATIVE


def test_front_diagonal_auto_background_inpaint_strip_cleanup_flag_applies_success_preset() -> None:
    """strip cleanup flag가 성공했던 하단 strip 제거 조합을 묶는지 확인한다."""
    m = _load_script("run_front_diagonal_auto_background_inpaint.py")

    args = m._parse_args(["--front-diagonal-strip-cleanup"])

    assert args.front_diagonal_strip_cleanup
    assert args.background_mode == "free"
    assert args.prefill_bottom_strip
    assert args.bottom_strip_ratio == 0.10
    assert args.bottom_strip_color == "neutral_paved"
    assert args.bottom_strip_prefill_mode == "feather"
    assert args.second_pass_bottom_strip
    assert args.second_pass_bottom_strip_ratio == 0.28
    assert args.second_pass_strength == 1.0
    assert args.second_pass_feather_ratio == 0.45


def test_front_diagonal_auto_background_inpaint_strip_cleanup_is_opt_in() -> None:
    """cleanup flag를 켜지 않은 기본 경로는 guided mode와 보수적인 옵션을 유지해야 한다."""
    m = _load_script("run_front_diagonal_auto_background_inpaint.py")

    args = m._parse_args([])

    assert not args.front_diagonal_strip_cleanup
    assert args.background_mode == "guided"
    assert not args.prefill_bottom_strip
    assert args.bottom_strip_prefill_mode == "solid"
    assert not args.second_pass_bottom_strip
    assert args.second_pass_bottom_strip_ratio == 0.16
    assert args.second_pass_strength == 0.75
    assert args.second_pass_feather_ratio == 0.35


def test_front_diagonal_auto_background_inpaint_script_can_resolve_free_prompt() -> None:
    """free background mode는 yard/ground 소재를 직접 지정하지 않고 모델 자유도를 높여야 한다."""
    m = _load_script("run_front_diagonal_auto_background_inpaint.py")

    prompt, negative = m._resolve_background_prompt_pair("korean_house", "free")

    assert prompt == (
        "realistic Korean residential setting, natural daylight, "
        "background matching the house"
    )
    assert "dry grass" not in prompt
    assert "flat ground" not in prompt
    assert "yard" not in prompt
    assert "pool" in negative
    assert "display base" in negative
    assert "foreground grass strip" in negative
    assert "retaining wall" not in negative


def test_front_diagonal_auto_background_inpaint_script_keeps_guided_prompt() -> None:
    """guided background mode는 preset별 yard/background prior를 그대로 유지해야 한다."""
    m = _load_script("run_front_diagonal_auto_background_inpaint.py")

    prompt, negative = m._resolve_background_prompt_pair("korean_house", "guided")

    assert "dry grass" in prompt
    assert "flat ground around house" in prompt
    assert "retaining wall" in negative


def test_front_diagonal_auto_background_inpaint_prefills_bottom_strip_only() -> None:
    """bottom strip prefill은 설정한 하단 band만 바꾸고 나머지 source 픽셀은 보존해야 한다."""
    from PIL import Image

    m = _load_script("run_front_diagonal_auto_background_inpaint.py")
    source = Image.new("RGB", (10, 10), (20, 30, 40))

    result = m._prefill_bottom_strip(
        source,
        ratio=0.2,
        color_name="neutral_paved",
        mode="solid",
    )

    assert result.getpixel((5, 7)) == (20, 30, 40)
    assert result.getpixel((5, 8)) == m.BOTTOM_STRIP_COLORS["neutral_paved"]
    assert result.getpixel((5, 9)) == m.BOTTOM_STRIP_COLORS["neutral_paved"]


def test_front_diagonal_auto_background_inpaint_feather_prefill_blends_bottom_strip() -> None:
    """feather prefill은 원본 픽셀에서 목표 색으로 점진적으로 섞이도록 적용되어야 한다."""
    from PIL import Image

    m = _load_script("run_front_diagonal_auto_background_inpaint.py")
    source = Image.new("RGB", (4, 4), (10, 20, 30))

    result = m._prefill_bottom_strip(
        source,
        ratio=0.5,
        color_name="neutral_paved",
        mode="feather",
    )

    assert result.getpixel((2, 1)) == (10, 20, 30)
    assert result.getpixel((2, 2)) == (10, 20, 30)
    assert result.getpixel((2, 3)) == m.BOTTOM_STRIP_COLORS["neutral_paved"]


def test_front_diagonal_auto_background_inpaint_makes_feathered_bottom_mask() -> None:
    """second-pass 하단 strip mask는 위쪽 경계는 feather 처리하고 아래쪽은 완전히 채워야 한다."""
    m = _load_script("run_front_diagonal_auto_background_inpaint.py")

    mask = m._make_bottom_strip_mask((4, 10), ratio=0.4, feather_ratio=0.5)

    assert mask.getpixel((2, 5)) == 0
    assert 0 < mask.getpixel((2, 6)) < 255
    assert mask.getpixel((2, 7)) == 255
    assert mask.getpixel((2, 9)) == 255


def test_select_ifc_geometry_d7_winner_writes_decision_manifest(tmp_path: Path) -> None:
    """D-7 selector는 D-6/D-6.5 산출물에서 depth_edge winner를 고정해야 한다."""
    import json

    from PIL import Image

    m = _load_script("select_ifc_geometry_d7_winner.py")
    d6_dir = tmp_path / "d6"
    d65_dir = tmp_path / "d65"
    output_dir = tmp_path / "d7"
    for case_name in (
        "baseline_default",
        "depth_edge_control",
        "depth_edge_control_plus_shape_lock_compressed",
    ):
        case_dir = d65_dir / case_name
        case_dir.mkdir(parents=True)
        for view in ("front_diagonal_left", "front_diagonal_right"):
            Image.new("RGB", (8, 4), (30, 80, 120)).save(
                case_dir / f"photo_{view}.png"
            )

    baseline_dir = d6_dir / "baseline_default"
    baseline_dir.mkdir(parents=True)
    for view in ("front_diagonal_left", "front_diagonal_right"):
        Image.new("RGB", (8, 4), (120, 80, 30)).save(
            baseline_dir / f"photo_{view}.png"
        )

    d6_manifest = {
        "sourceIfcPath": "shinchan.ifc",
        "preset": "korean_house",
        "timeOfDay": "DAY",
        "cudaAvailable": True,
        "cases": [
            _d7_case_payload("baseline_default", baseline_dir, "default", False),
            _d7_case_payload(
                "depth_edge_control_plus_shape_lock",
                d6_dir / "depth_edge_control_plus_shape_lock",
                "depth_edge",
                True,
            ),
            _d7_case_payload(
                "element_composite_control",
                d6_dir / "element_composite_control",
                "element_composite",
                False,
            ),
            _d7_case_payload(
                "element_composite_control_plus_shape_lock",
                d6_dir / "element_composite_control_plus_shape_lock",
                "element_composite",
                True,
            ),
            _d7_case_payload("shape_lock_only", d6_dir / "shape_lock_only", "default", True),
        ],
    }
    d65_manifest = {
        "sourceIfcPath": "shinchan.ifc",
        "preset": "korean_house",
        "timeOfDay": "DAY",
        "cudaAvailable": True,
        "cases": [
            _d7_case_payload(
                "depth_edge_control",
                d65_dir / "depth_edge_control",
                "depth_edge",
                False,
            ),
            _d7_case_payload(
                "depth_edge_control_plus_shape_lock_compressed",
                d65_dir / "depth_edge_control_plus_shape_lock_compressed",
                "depth_edge",
                True,
            ),
        ],
    }
    d65_delta = [
        {
            "case": "depth_edge_control",
            "view": "front_diagonal_right",
            "silhouetteIou": 0.07,
            "deltaSilhouetteIou": -0.01,
            "edgeAlignmentScore": 0.01,
            "deltaEdgeAlignmentScore": 0.005,
            "buildingBboxOverlap": 0.09,
            "deltaBuildingBboxOverlap": 0.0,
        }
    ]
    d6_dir.mkdir(parents=True, exist_ok=True)
    d65_dir.mkdir(parents=True, exist_ok=True)
    (d6_dir / "matrix_manifest.json").write_text(
        json.dumps(d6_manifest),
        encoding="utf-8",
    )
    (d65_dir / "matrix_manifest.json").write_text(
        json.dumps(d65_manifest),
        encoding="utf-8",
    )
    (d65_dir / "d65_metric_delta.json").write_text(
        json.dumps(d65_delta),
        encoding="utf-8",
    )

    manifest = m.select_ifc_geometry_d7_winner(
        d6_dir=d6_dir,
        d65_dir=d65_dir,
        output_dir=output_dir,
    )

    assert manifest["winner"]["caseName"] == "depth_edge_control"
    assert manifest["phaseEInput"]["geometryControlInputMode"] == "depth_edge"
    assert manifest["phaseEInput"]["useIfcShapeLockPrompt"] is False
    assert (output_dir / "geometry_winner_manifest.json").exists()
    assert (output_dir / "d7_geometry_winner_contact_sheet.png").exists()


def test_generate_ifc_geometry_color_e2_requires_depth_edge_without_shape_lock() -> None:
    """E-2 color 후보는 D-7 depth_edge winner와 shape-lock off 조건을 고정해야 한다."""
    m = _load_script("generate_ifc_geometry_color_e2_artifacts.py")
    d7_manifest = {
        "phaseEInput": {
            "geometryControlInputMode": "depth_edge",
            "useIfcShapeLockPrompt": False,
            "caseDir": "outputs/winner",
        }
    }

    phase_e_input = m._resolve_phase_e_input(d7_manifest)

    assert phase_e_input["geometryControlInputMode"] == "depth_edge"
    assert phase_e_input["useIfcShapeLockPrompt"] is False
    assert [case.case_name for case in m.E2_CASES] == [
        "geometry_depth_edge",
        "geometry_depth_edge_color_prompt",
        "geometry_depth_edge_color_composite_probe",
        "geometry_depth_edge_post_color_lock",
    ]


@pytest.mark.parametrize(
    "phase_e_input",
    [
        {
            "geometryControlInputMode": "default",
            "useIfcShapeLockPrompt": False,
        },
        {
            "geometryControlInputMode": "depth_edge",
            "useIfcShapeLockPrompt": True,
        },
    ],
)
def test_generate_ifc_geometry_color_e2_rejects_unlocked_geometry(
    phase_e_input: dict[str, object],
) -> None:
    """E-2는 geometry mode나 shape-lock 조건이 흔들리면 중단해야 한다."""
    m = _load_script("generate_ifc_geometry_color_e2_artifacts.py")

    with pytest.raises(ValueError):
        m._resolve_phase_e_input({"phaseEInput": phase_e_input})


def test_generate_ifc_geometry_color_e25_builds_compact_prompt_metadata(
    ifc4_fixture: Path,
) -> None:
    """E-2.5 should record compact prompt length before running GPU artifacts."""
    m = _load_script("generate_ifc_geometry_color_e25_recheck.py")
    from ai_rendering.ifc2img.semantics import extract_ifc_color_summary

    metadata = m._build_prompt_metadata(
        color_summary=extract_ifc_color_summary(ifc4_fixture),
        preset="korean_house",
        time_of_day="DAY",
    )

    assert metadata["compactColorPrompt"] == (
        "IFC colors: green roof, gray walls, blue glass, tan wood door."
    )
    assert metadata["compactColorPromptWordCount"] == 11
    assert metadata["compactBasePromptWordCount"] < metadata["colorSafePromptWordCount"]
    assert metadata["compactPromptWithin77WordBudget"] is True


def test_generate_ifc_geometry_color_e25_normalizes_post_lock_strengths() -> None:
    """Post color lock strength candidates should stay clamped and deterministic."""
    m = _load_script("generate_ifc_geometry_color_e25_recheck.py")

    assert m._normalized_strengths((1.2, 0.75, -0.5, 0.75)) == (0.0, 0.75, 1.0)
    assert m._post_lock_case_name("DAY", 0.75) == (
        "geometry_depth_edge_post_color_lock_0_75_day"
    )


def test_generate_ifc_geometry_e26_rejects_korean_house_preset(tmp_path: Path) -> None:
    """E-2.6 must be an explicit preset-off baseline, not another korean_house run."""
    m = _load_script("generate_ifc_geometry_e26_preset_off_baseline.py")

    with pytest.raises(ValueError, match="korean_house disabled"):
        m.generate_ifc_geometry_e26_preset_off_baseline(
            ifc_path=tmp_path / "dummy.ifc",
            d7_manifest_path=tmp_path / "d7.json",
            output_dir=tmp_path / "out",
            preset="korean_house",
            time_of_day="DAY",
            korean_reference_manifest_path=None,
        )


def test_generate_ifc_geometry_e26_builds_minimal_prompt_metadata() -> None:
    """E-2.6 records that ifc_minimal does not carry korean_house style cues."""
    m = _load_script("generate_ifc_geometry_e26_preset_off_baseline.py")

    metadata = m._build_prompt_metadata("ifc_minimal", "DAY")

    assert metadata["preset"] == "ifc_minimal"
    assert metadata["hasKoreanHouseStyleCue"] is False
    assert "preserve IFC building geometry" in metadata["prompt"]
    assert metadata["promptWordCount"] <= 35


def test_generate_ifc_geometry_e26_case_name_is_stable() -> None:
    """E-2.6 output directory names should be deterministic for README tracking."""
    m = _load_script("generate_ifc_geometry_e26_preset_off_baseline.py")

    assert m._case_name("ifc_minimal", "DAY") == (
        "geometry_depth_edge_ifc_minimal_day"
    )


def test_generate_ifc_geometry_e27_rejects_non_minimal_baseline() -> None:
    """E-2.7 should only accept the IFC-first ifc_minimal baseline."""
    m = _load_script("generate_ifc_geometry_e27_color_naturalization.py")

    with pytest.raises(ValueError, match="ifc_minimal"):
        m._resolve_e26_baseline_case(
            {
                "preset": "korean_house",
                "cases": [
                    {
                        "preset": "korean_house",
                        "geometryMode": "depth_edge",
                    }
                ],
            }
        )


def test_generate_ifc_geometry_e27_soft_alpha_feathers_mask() -> None:
    """Naturalized color lock should create a soft bounded alpha mask."""
    from PIL import Image

    m = _load_script("generate_ifc_geometry_e27_color_naturalization.py")
    mask = Image.new("L", (7, 7), 0)
    mask.putpixel((3, 3), 255)

    alpha = m._build_soft_alpha_mask(
        mask,
        expected_size=(7, 7),
        config=m.NaturalizedColorLockConfig(
            strength=0.5,
            feather_radius=1.0,
            erosion_radius=0,
        ),
    )

    assert 0.0 < alpha[3, 2] < alpha[3, 3] <= 0.5
    assert alpha[0, 0] == 0.0


def test_generate_ifc_geometry_e27_decision_archives_hard_lock() -> None:
    """E-2.7 winner should be naturalized; hard lock stays archived."""
    m = _load_script("generate_ifc_geometry_e27_color_naturalization.py")

    decision = m._build_decision(
        [
            {"caseName": "ifc_minimal_baseline_day", "views": []},
            {"caseName": "ifc_minimal_post_color_lock_hard_1_00_day", "views": []},
            {
                "caseName": m.NATURALIZED_CASE_NAME,
                "views": [
                    {
                        "view": "front_diagonal_left",
                        "evaluation": {"categories": {}},
                    }
                ],
            },
        ]
    )

    assert decision["recommendedForE3"] == m.NATURALIZED_CASE_NAME
    assert decision["hardLockHandling"] == "archived_only"
    assert decision["koreanHouseHandling"] == "historical_record_only"


def test_generate_ifc_geometry_e28_requires_e27_naturalized_case() -> None:
    """E-2.8 should only start when the E-2.7 naturalized artifact exists."""
    m = _load_script("generate_ifc_geometry_e28_category_tuning.py")

    with pytest.raises(ValueError, match="E-2.7 first naturalized case"):
        m._resolve_e27_naturalized_case({"cases": [{"caseName": "other_case"}]})


def test_generate_ifc_geometry_e28_case_score_prefers_left_door_and_roof() -> None:
    """E-2.8 winner scoring should favor roof improvement and visible left-door recovery."""
    m = _load_script("generate_ifc_geometry_e28_category_tuning.py")

    def payload(
        *,
        pixel_count: int,
        delta: float,
        family_pass: bool,
        delta_pass: bool,
    ) -> dict[str, object]:
        return {
            "pixelCount": pixel_count,
            "deltaToTarget": delta,
            "familyPass": family_pass,
            "deltaPass": delta_pass,
        }

    better = {
        "caseName": "better",
        "colorMode": "category_tuned_post_lock",
        "views": [
            {
                "view": "front_diagonal_left",
                "evaluation": {
                    "categories": {
                        "ROOF": payload(
                            pixel_count=10, delta=0.2, family_pass=True, delta_pass=True
                        ),
                        "WALL": payload(
                            pixel_count=10, delta=0.2, family_pass=True, delta_pass=True
                        ),
                        "WINDOW": payload(
                            pixel_count=10, delta=0.2, family_pass=True, delta_pass=True
                        ),
                        "DOOR": payload(
                            pixel_count=10, delta=0.2, family_pass=True, delta_pass=False
                        ),
                    }
                },
            },
            {
                "view": "front_diagonal_right",
                "evaluation": {
                    "categories": {
                        "ROOF": payload(
                            pixel_count=10, delta=0.3, family_pass=True, delta_pass=False
                        ),
                        "WALL": payload(
                            pixel_count=10, delta=0.2, family_pass=True, delta_pass=True
                        ),
                        "WINDOW": payload(
                            pixel_count=10, delta=0.2, family_pass=True, delta_pass=True
                        ),
                        "DOOR": payload(
                            pixel_count=0, delta=1.0, family_pass=False, delta_pass=False
                        ),
                    }
                },
            },
        ],
    }
    weaker = {
        "caseName": "weaker",
        "colorMode": "category_tuned_post_lock",
        "views": [
            {
                "view": "front_diagonal_left",
                "evaluation": {
                    "categories": {
                        "ROOF": payload(
                            pixel_count=10, delta=0.5, family_pass=False, delta_pass=False
                        ),
                        "WALL": payload(
                            pixel_count=10, delta=0.2, family_pass=True, delta_pass=True
                        ),
                        "WINDOW": payload(
                            pixel_count=10, delta=0.4, family_pass=False, delta_pass=False
                        ),
                        "DOOR": payload(
                            pixel_count=10, delta=0.8, family_pass=False, delta_pass=False
                        ),
                    }
                },
            },
            {
                "view": "front_diagonal_right",
                "evaluation": {
                    "categories": {
                        "ROOF": payload(
                            pixel_count=10, delta=0.5, family_pass=False, delta_pass=False
                        ),
                        "WALL": payload(
                            pixel_count=10, delta=0.2, family_pass=True, delta_pass=True
                        ),
                        "WINDOW": payload(
                            pixel_count=10, delta=0.4, family_pass=False, delta_pass=False
                        ),
                        "DOOR": payload(
                            pixel_count=0, delta=1.0, family_pass=False, delta_pass=False
                        ),
                    }
                },
            },
        ],
    }

    assert m._case_score(better) > m._case_score(weaker)


def test_generate_ifc_geometry_e28_decision_recommends_top_scored_case() -> None:
    """E-2.8 should forward the highest-scoring tuned case to E-3."""
    m = _load_script("generate_ifc_geometry_e28_category_tuning.py")

    def roof_only_payload(
        *,
        delta: float,
        family_pass: bool,
        delta_pass: bool,
    ) -> dict[str, object]:
        return {
            "view": "front_diagonal_left",
            "evaluation": {
                "categories": {
                    "ROOF": {
                        "pixelCount": 10,
                        "deltaToTarget": delta,
                        "familyPass": family_pass,
                        "deltaPass": delta_pass,
                    }
                }
            },
        }

    def roof_only_payload_right(
        *, delta: float, family_pass: bool, delta_pass: bool
    ) -> dict[str, object]:
        return {
            "view": "front_diagonal_right",
            "evaluation": {
                "categories": {
                    "ROOF": {
                        "pixelCount": 10,
                        "deltaToTarget": delta,
                        "familyPass": family_pass,
                        "deltaPass": delta_pass,
                    }
                }
            },
        }

    decision = m._build_decision(
        [
            {"caseName": "ifc_minimal_baseline_day", "colorMode": "baseline", "views": []},
            {
                "caseName": "ifc_minimal_post_color_lock_naturalized_balanced_day",
                "colorMode": "category_tuned_post_lock",
                "views": [
                    roof_only_payload(delta=0.2, family_pass=True, delta_pass=True),
                    roof_only_payload_right(delta=0.2, family_pass=True, delta_pass=True),
                ],
            },
            {
                "caseName": "ifc_minimal_post_color_lock_naturalized_roof_soft_day",
                "colorMode": "category_tuned_post_lock",
                "views": [
                    roof_only_payload(delta=0.6, family_pass=False, delta_pass=False),
                    roof_only_payload_right(delta=0.6, family_pass=False, delta_pass=False),
                ],
            },
        ]
    )

    assert decision["recommendedForE3"] == "ifc_minimal_post_color_lock_naturalized_balanced_day"
    assert decision["archivedCases"] == [
        "ifc_minimal_post_color_lock_hard_1_00_day",
        "ifc_minimal_post_color_lock_naturalized_day",
    ]


def test_generate_ifc_geometry_e29_resolves_e28_winner_case() -> None:
    """E-2.9 should start from the E-2.8 recommended winner."""
    m = _load_script("generate_ifc_geometry_e29_roof_window_polish.py")

    winner = m._resolve_e28_winner_case(
        {
            "decision": {"recommendedForE3": "winner_case"},
            "cases": [
                {"caseName": "other_case"},
                {"caseName": "winner_case", "caseDir": "outputs/winner_case"},
            ],
        }
    )

    assert winner["caseName"] == "winner_case"


def test_generate_ifc_geometry_e29_case_score_preserves_door_and_improves_roof() -> None:
    """E-2.9 scoring should favor roof/window gains without losing the left door fix."""
    m = _load_script("generate_ifc_geometry_e29_roof_window_polish.py")

    def category(
        *,
        pixel_count: int,
        delta: float,
        family_pass: bool,
        delta_pass: bool,
    ) -> dict[str, object]:
        return {
            "pixelCount": pixel_count,
            "deltaToTarget": delta,
            "familyPass": family_pass,
            "deltaPass": delta_pass,
        }

    stronger = {
        "caseName": "stronger",
        "colorMode": "roof_window_polish",
        "views": [
            {
                "view": "front_diagonal_left",
                "evaluation": {
                    "categories": {
                        "ROOF": category(
                            pixel_count=10, delta=0.25, family_pass=True, delta_pass=False
                        ),
                        "WALL": category(
                            pixel_count=10, delta=0.15, family_pass=True, delta_pass=True
                        ),
                        "WINDOW": category(
                            pixel_count=10, delta=0.16, family_pass=True, delta_pass=True
                        ),
                        "DOOR": category(
                            pixel_count=10, delta=0.05, family_pass=True, delta_pass=True
                        ),
                    }
                },
            },
            {
                "view": "front_diagonal_right",
                "evaluation": {
                    "categories": {
                        "ROOF": category(
                            pixel_count=10, delta=0.30, family_pass=True, delta_pass=False
                        ),
                        "WALL": category(
                            pixel_count=10, delta=0.15, family_pass=True, delta_pass=True
                        ),
                        "WINDOW": category(
                            pixel_count=10, delta=0.18, family_pass=True, delta_pass=False
                        ),
                        "DOOR": category(
                            pixel_count=0, delta=1.0, family_pass=False, delta_pass=False
                        ),
                    }
                },
            },
        ],
    }
    weaker = {
        "caseName": "weaker",
        "colorMode": "roof_window_polish",
        "views": [
            {
                "view": "front_diagonal_left",
                "evaluation": {
                    "categories": {
                        "ROOF": category(
                            pixel_count=10, delta=0.40, family_pass=False, delta_pass=False
                        ),
                        "WALL": category(
                            pixel_count=10, delta=0.15, family_pass=True, delta_pass=True
                        ),
                        "WINDOW": category(
                            pixel_count=10, delta=0.25, family_pass=True, delta_pass=False
                        ),
                        "DOOR": category(
                            pixel_count=10, delta=0.20, family_pass=True, delta_pass=True
                        ),
                    }
                },
            },
            {
                "view": "front_diagonal_right",
                "evaluation": {
                    "categories": {
                        "ROOF": category(
                            pixel_count=10, delta=0.45, family_pass=False, delta_pass=False
                        ),
                        "WALL": category(
                            pixel_count=10, delta=0.15, family_pass=True, delta_pass=True
                        ),
                        "WINDOW": category(
                            pixel_count=10, delta=0.28, family_pass=True, delta_pass=False
                        ),
                        "DOOR": category(
                            pixel_count=0, delta=1.0, family_pass=False, delta_pass=False
                        ),
                    }
                },
            },
        ],
    }

    assert m._case_score(stronger, source_left_door_delta=0.054) > m._case_score(
        weaker, source_left_door_delta=0.054
    )


def test_generate_ifc_geometry_e29_decision_recommends_top_scored_case() -> None:
    """E-2.9 should pick one final polish winner for E-3."""
    m = _load_script("generate_ifc_geometry_e29_roof_window_polish.py")

    def view_payload(
        view: str,
        roof_delta: float,
        roof_family: bool,
        window_delta: float,
        door_delta: float,
    ) -> dict[str, object]:
        return {
            "view": view,
            "evaluation": {
                "categories": {
                    "ROOF": {
                        "pixelCount": 10,
                        "deltaToTarget": roof_delta,
                        "familyPass": roof_family,
                        "deltaPass": False,
                    },
                    "WALL": {
                        "pixelCount": 10,
                        "deltaToTarget": 0.15,
                        "familyPass": True,
                        "deltaPass": True,
                    },
                    "WINDOW": {
                        "pixelCount": 10,
                        "deltaToTarget": window_delta,
                        "familyPass": True,
                        "deltaPass": False,
                    },
                    "DOOR": {
                        "pixelCount": 10 if view == "front_diagonal_left" else 0,
                        "deltaToTarget": door_delta,
                        "familyPass": True if view == "front_diagonal_left" else False,
                        "deltaPass": True if view == "front_diagonal_left" else False,
                    },
                }
            },
        }

    decision = m._build_decision(
        [
            {
                "caseName": "ifc_minimal_post_color_lock_naturalized_door_strong_day",
                "colorMode": "e28_winner_baseline",
                "views": [
                    view_payload("front_diagonal_left", 0.37, False, 0.19, 0.054),
                    view_payload("front_diagonal_right", 0.34, False, 0.20, 1.0),
                ],
            },
            {
                "caseName": "ifc_minimal_post_color_lock_roof_green_push_balanced_day",
                "colorMode": "roof_window_polish",
                "views": [
                    view_payload("front_diagonal_left", 0.28, True, 0.17, 0.06),
                    view_payload("front_diagonal_right", 0.30, True, 0.18, 1.0),
                ],
            },
            {
                "caseName": "ifc_minimal_post_color_lock_window_delta_balanced_day",
                "colorMode": "roof_window_polish",
                "views": [
                    view_payload("front_diagonal_left", 0.36, False, 0.14, 0.05),
                    view_payload("front_diagonal_right", 0.34, False, 0.16, 1.0),
                ],
            },
        ]
    )

    assert (
        decision["recommendedForE3"]
        == "ifc_minimal_post_color_lock_roof_green_push_balanced_day"
    )


def test_generate_ifc_geometry_e3_resolves_day_sources() -> None:
    """E-3는 E-2.6 DAY baseline과 E-2.9 winner를 source로 고정해야 한다."""
    m = _load_script("generate_ifc_geometry_e3_combined_final_matrix.py")

    baseline = m._resolve_day_baseline_case(
        {
            "cases": [
                {"caseName": "other_case"},
                {
                    "caseName": "geometry_depth_edge_ifc_minimal_day",
                    "caseDir": "outputs/day_baseline",
                },
            ]
        }
    )
    improved = m._resolve_e29_recommended_case(
        {
            "decision": {
                "recommendedForE3": "ifc_minimal_post_color_lock_roof_green_push_balanced_day"
            },
            "cases": [
                {"caseName": "other_case"},
                {
                    "caseName": "ifc_minimal_post_color_lock_roof_green_push_balanced_day",
                    "caseDir": "outputs/day_improved",
                },
            ],
        }
    )

    assert baseline["caseName"] == "geometry_depth_edge_ifc_minimal_day"
    assert (
        improved["caseName"]
        == "ifc_minimal_post_color_lock_roof_green_push_balanced_day"
    )


def test_generate_ifc_geometry_e3_metric_table_records_case_flags() -> None:
    """E-3 metric table은 shape/color source flag와 view별 category delta를 함께 기록해야 한다."""
    m = _load_script("generate_ifc_geometry_e3_combined_final_matrix.py")

    rows = m._build_metric_table(
        [
            {
                "caseName": "ifc_minimal_baseline_day",
                "timeOfDay": "DAY",
                "geometryMode": "depth_edge",
                "colorMode": "baseline",
                "shapeLockPromptUsed": False,
                "ifcColorPromptUsed": False,
                "postColorLockStrength": 0.0,
                "views": [
                    {
                        "view": "front_diagonal_left",
                        "photo": "photo_front_diagonal_left.png",
                        "geometryFidelity": {
                            "estimatedPhotoForegroundFillRatio": 0.42
                        },
                        "evaluation": {
                            "categories": {
                                "ROOF": {
                                    "deltaToTarget": 0.18,
                                    "familyPass": True,
                                },
                                "WALL": {
                                    "deltaToTarget": 0.11,
                                    "familyPass": True,
                                },
                                "WINDOW": {
                                    "deltaToTarget": 0.15,
                                    "familyPass": True,
                                },
                                "DOOR": {
                                    "deltaToTarget": 0.07,
                                    "familyPass": True,
                                },
                            }
                        },
                    }
                ],
            }
        ]
    )

    assert rows == [
        {
            "caseName": "ifc_minimal_baseline_day",
            "timeOfDay": "DAY",
            "view": "front_diagonal_left",
            "geometryMode": "depth_edge",
            "colorMode": "baseline",
            "shapeLockPromptUsed": False,
            "ifcColorPromptUsed": False,
            "postColorLockStrength": 0.0,
            "estimatedPhotoForegroundFillRatio": 0.42,
            "roofDeltaToTarget": 0.18,
            "wallDeltaToTarget": 0.11,
            "windowDeltaToTarget": 0.15,
            "doorDeltaToTarget": 0.07,
            "roofFamilyPass": True,
            "wallFamilyPass": True,
            "windowFamilyPass": True,
            "doorFamilyPass": True,
            "photo": "photo_front_diagonal_left.png",
        }
    ]


def _d7_case_payload(
    case_name: str,
    case_dir: Path,
    geometry_control_input_mode: str,
    use_ifc_shape_lock_prompt: bool,
) -> dict[str, object]:
    return {
        "caseName": case_name,
        "caseDir": str(case_dir),
        "geometryControlInputMode": geometry_control_input_mode,
        "useIfcShapeLockPrompt": use_ifc_shape_lock_prompt,
        "debugManifestPath": str(case_dir / "debug" / "debug_manifest.json"),
        "photos": [
            str(case_dir / "photo_front_diagonal_left.png"),
            str(case_dir / "photo_front_diagonal_right.png"),
        ],
    }


def test_ifc_to_styled_render_plan_detects_semantic_slots() -> None:
    """preset/view 조합별 semantic ControlNet 필요 여부를 판별하는지 확인한다."""
    m = _load_script("ifc_to_styled.py")

    plan = m._resolve_render_plan(
        [m.IFCView.FRONT, m.IFCView.SIDE],
        ["korean_house", "scandinavian"],
    )

    assert m._render_plan_requires_semantic_controlnet(plan)
    assert (
        m._render_option_label("korean_house", m.IFCView.FRONT)
        == "use_front_full_width_semantic_control, ground=neutral, semantic_scale=0.35"
    )
    assert (
        m._render_option_label("korean_house", m.IFCView.SIDE)
        == "use_front_side_semantic_control, ground=neutral, semantic_scale=0.35"
    )
    assert m._render_option_label("scandinavian", m.IFCView.FRONT) == "depth-only"
    assert m._render_option_label("scandinavian", m.IFCView.SIDE) == "depth-only"


def test_ifc_to_styled_creates_semantic_renderer_only_when_needed() -> None:
    """semantic ControlNet renderer는 필요한 render plan일 때만 명시적으로 생성되어야 한다."""
    m = _load_script("ifc_to_styled.py")

    class FakeRenderer:
        def __init__(self, **kwargs: object) -> None:
            self.kwargs = kwargs

    depth_renderer, depth_mode = m._create_depth_style_renderer(
        FakeRenderer,
        requires_semantic=False,
    )
    semantic_renderer, semantic_mode = m._create_depth_style_renderer(
        FakeRenderer,
        requires_semantic=True,
    )

    assert depth_mode == "depth-only"
    assert depth_renderer.kwargs == {}
    assert semantic_mode == "depth+semantic"
    assert semantic_renderer.kwargs == {
        "semantic_controlnet_model_id": DEFAULT_CONTROLNET_SEG_ID
    }


def test_ifc_to_styled_render_depths_can_enable_auto_zoom(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """fill-aware iterative depth zoom 옵션을 IFCRenderer에 전달하는지 확인한다."""
    from PIL import Image

    m = _load_script("ifc_to_styled.py")
    inits: list[dict[str, object]] = []

    class FakeIFCRenderer:
        def __init__(self, **kwargs: object) -> None:
            inits.append(kwargs)

        def render_views(self, _ifc_path: Path, views: list[object]) -> dict[object, Image.Image]:
            return {
                view: Image.new("L", (4, 4), 128)
                for view in views
            }

    monkeypatch.setattr(m, "IFCRenderer", FakeIFCRenderer)

    paths = m._render_depths(
        tmp_path / "dummy.ifc",
        [m.IFCView.FRONT_DIAGONAL_RIGHT],
        tmp_path / "out",
        auto_zoom=True,
        front_diagonal_target_ratio=0.25,
        iter_tolerance=0.05,
    )

    expected_overrides = {
        m.IFCView.FRONT_DIAGONAL_RIGHT: 0.25,
        m.IFCView.FRONT_DIAGONAL_LEFT: 0.25,
    }
    expected_ground_overrides = {
        m.IFCView.FRONT_DIAGONAL_RIGHT: 1.05,
        m.IFCView.FRONT_DIAGONAL_LEFT: 1.05,
    }
    assert inits == [
        {
            "width": 768,
            "height": 448,
            "auto_zoom": m.AutoZoomMode.ITERATIVE,
            "iter_tolerance": 0.05,
            "view_target_overrides": expected_overrides,
            "view_ground_extent_overrides": expected_ground_overrides,
            "view_camera_overrides": None,
            "ground_z_override": None,
            "look_at_height_ratio": m.PHOTO_DEPTH_RENDER_DEFAULTS.look_at_height_ratio,
        }
    ]
    assert paths[m.IFCView.FRONT_DIAGONAL_RIGHT].name == "depth_front_diagonal_right.png"
    assert paths[m.IFCView.FRONT_DIAGONAL_RIGHT].exists()


def test_ifc_to_styled_render_depths_leaves_front_diagonal_defaults_to_service(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """CLI에서 생략한 front diagonal 기본값은 service factory가 단일하게 결정해야 한다."""
    from PIL import Image

    m = _load_script("ifc_to_styled.py")
    factory_calls: list[dict[str, object]] = []

    class FakeIFCRenderer:
        def render_views(self, _ifc_path: Path, views: list[object]) -> dict[object, Image.Image]:
            return {
                view: Image.new("L", (4, 4), 128)
                for view in views
            }

    def fake_create_photo_ifc_renderer(_renderer_cls: type, **kwargs: object) -> FakeIFCRenderer:
        factory_calls.append(kwargs)
        return FakeIFCRenderer()

    monkeypatch.setattr(m, "create_photo_ifc_renderer", fake_create_photo_ifc_renderer)

    m._render_depths(
        tmp_path / "dummy.ifc",
        [m.IFCView.FRONT_DIAGONAL_RIGHT],
        tmp_path / "out",
        auto_zoom=True,
    )

    assert factory_calls == [
        {
            "width": m.PHOTO_DEPTH_RENDER_DEFAULTS.width,
            "height": m.PHOTO_DEPTH_RENDER_DEFAULTS.height,
            "auto_zoom": True,
            "iter_tolerance": m.PHOTO_DEPTH_RENDER_DEFAULTS.iter_tolerance,
        }
    ]


def test_ifc_to_styled_builds_front_diagonal_target_overrides() -> None:
    """front diagonal target ratio override는 대각선 front diagonal view 3종에만 적용되어야 한다."""
    m = _load_script("ifc_to_styled.py")

    assert m._build_front_diagonal_target_overrides(None) == {}
    assert m._build_front_diagonal_target_overrides(0.25) == {
        m.IFCView.FRONT_DIAGONAL_RIGHT: 0.25,
        m.IFCView.FRONT_DIAGONAL_LEFT: 0.25,
        
    }
    with pytest.raises(SystemExit):
        m._build_front_diagonal_target_overrides(1.5)


def test_ifc_to_styled_builds_front_diagonal_ground_extent_overrides() -> None:
    """front diagonal ground extent override는 좌/우 대각선 2시점에만 적용되어야 한다."""
    m = _load_script("ifc_to_styled.py")

    assert m._build_front_diagonal_ground_extent_overrides(None) == {}
    assert m._build_front_diagonal_ground_extent_overrides(0.9) == {
        m.IFCView.FRONT_DIAGONAL_RIGHT: 0.9,
        m.IFCView.FRONT_DIAGONAL_LEFT: 0.9,
        
    }
    with pytest.raises(SystemExit):
        m._build_front_diagonal_ground_extent_overrides(0.0)


def test_ifc_to_styled_render_depths_passes_front_diagonal_ground_extent_override(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """front diagonal ground geometry override를 IFCRenderer 생성 인자로 넘기는지 확인한다."""
    from PIL import Image

    m = _load_script("ifc_to_styled.py")
    inits: list[dict[str, object]] = []

    class FakeIFCRenderer:
        def __init__(self, **kwargs: object) -> None:
            inits.append(kwargs)

        def render_views(self, _ifc_path: Path, views: list[object]) -> dict[object, Image.Image]:
            return {
                view: Image.new("L", (4, 4), 128)
                for view in views
            }

    monkeypatch.setattr(m, "IFCRenderer", FakeIFCRenderer)

    m._render_depths(
        tmp_path / "dummy.ifc",
        [m.IFCView.FRONT_DIAGONAL_RIGHT],
        tmp_path / "out",
        front_diagonal_ground_extent_factor=0.9,
    )

    expected_ground_overrides = {
        m.IFCView.FRONT_DIAGONAL_RIGHT: 0.9,
        m.IFCView.FRONT_DIAGONAL_LEFT: 0.9,
        
    }
    assert inits[0]["view_ground_extent_overrides"] == expected_ground_overrides


def test_ifc_to_styled_render_styles_passes_resolved_options(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """resolver에서 정한 semantic 옵션을 style render 호출에 전달하는지 확인한다."""
    from PIL import Image

    import ai_rendering.ifc2img as ifc2img

    m = _load_script("ifc_to_styled.py")
    calls: list[dict[str, object]] = []
    renderer_inits: list[dict[str, object]] = []

    class FakeResult:
        def save(self, path: Path) -> Path:
            path.parent.mkdir(parents=True, exist_ok=True)
            Image.new("RGB", (4, 4), (123, 123, 123)).save(path)
            return path

    class FakeRenderer:
        def __init__(self, **kwargs: object) -> None:
            self.device = "fake"
            self.kwargs = kwargs
            renderer_inits.append(kwargs)

        def render(self, _depth: Image.Image, _params: object, **kwargs: object) -> FakeResult:
            calls.append({"renderer_kwargs": self.kwargs, **kwargs})
            return FakeResult()

    monkeypatch.setattr(ifc2img, "DepthStyleRenderer", FakeRenderer)

    front_depth = tmp_path / "depth_front.png"
    side_depth = tmp_path / "depth_side.png"
    Image.new("RGB", (8, 8), (0, 0, 0)).save(front_depth)
    Image.new("RGB", (8, 8), (0, 0, 0)).save(side_depth)

    m._render_styles(
        {
            m.IFCView.FRONT: front_depth,
            m.IFCView.SIDE: side_depth,
        },
        ["korean_house", "scandinavian"],
        tmp_path / "styled",
    )

    assert len(calls) == 4
    assert {} in renderer_inits
    assert {"semantic_controlnet_model_id": DEFAULT_CONTROLNET_SEG_ID} in renderer_inits

    korean_front = next(
        c
        for c in calls
        if c["view"] is m.IFCView.FRONT
        and c["use_front_full_width_semantic_control"]
    )
    korean_side = next(
        c for c in calls if c["view"] is m.IFCView.SIDE and c["use_front_side_semantic_control"]
    )
    scandinavian_calls = [
        c for c in calls if c["renderer_kwargs"] == {} and not c["use_front_side_semantic_control"]
    ]

    assert korean_front["renderer_kwargs"] == {
        "semantic_controlnet_model_id": DEFAULT_CONTROLNET_SEG_ID
    }
    assert korean_front["front_side_ground_class"] == "neutral"
    assert korean_front["front_side_semantic_control_scale"] == 0.35
    assert korean_side["renderer_kwargs"] == {
        "semantic_controlnet_model_id": DEFAULT_CONTROLNET_SEG_ID
    }
    assert korean_side["front_side_ground_class"] == "neutral"
    assert korean_side["front_side_semantic_control_scale"] == 0.35
    assert len(scandinavian_calls) == 2


def test_ifc_to_styled_render_styles_passes_front_diagonal_ground_plane_aware_options(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """korean_house front diagonal slot의 ground-plane-aware semantic 옵션을 확인한다."""
    from PIL import Image

    import ai_rendering.ifc2img as ifc2img

    m = _load_script("ifc_to_styled.py")
    calls: list[dict[str, object]] = []

    class FakeResult:
        def save(self, path: Path) -> Path:
            path.parent.mkdir(parents=True, exist_ok=True)
            Image.new("RGB", (4, 4), (123, 123, 123)).save(path)
            return path

    class FakeRenderer:
        def __init__(self, **kwargs: object) -> None:
            self.device = "fake"

        def render(self, _depth: Image.Image, _params: object, **kwargs: object) -> FakeResult:
            calls.append(kwargs)
            return FakeResult()

    monkeypatch.setattr(ifc2img, "DepthStyleRenderer", FakeRenderer)
    depth = tmp_path / "depth_front_diagonal_right.png"
    Image.new("RGB", (8, 8), (0, 0, 0)).save(depth)

    m._render_styles(
        {m.IFCView.FRONT_DIAGONAL_RIGHT: depth},
        ["korean_house"],
        tmp_path / "styled",
    )

    assert calls == [
        {
            "view": m.IFCView.FRONT_DIAGONAL_RIGHT,
            "use_front_side_semantic_control": False,
            "use_front_full_width_semantic_control": False,
            "use_front_diagonal_ground_semantic_control": True,
            "use_front_diagonal_ground_plane_aware_semantic_control": True,
            "use_front_diagonal_ground_plane_control_attenuation": True,
            "front_side_ground_class": "grass",
            "front_side_semantic_control_scale": 0.25,
            "front_diagonal_ground_plane_control_attenuation_strength": 0.18,
        }
    ]
