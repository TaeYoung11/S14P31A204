"""Phase H-3 postprocess helpers.

Real-ESRGAN 4x upscale for IFC2IMG photoreal outputs. Keeps geometry/color
exactly (no diffusion). Cheap and predictable sharpness/detail boost.
"""

from __future__ import annotations

import hashlib
import sys
import types
from pathlib import Path

from PIL import Image

from .exceptions import IFCRenderError

DEFAULT_REALESRGAN_WEIGHT_URL = (
    "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/"
    "RealESRGAN_x4plus.pth"
)
# SHA256 of the official RealESRGAN_x4plus.pth release. Used to detect partial
# downloads, locally corrupted caches, and any upstream file substitution
# before the weight is handed to RRDBNet.load_state_dict (where a corrupt
# load would only surface deep into H-3).
REALESRGAN_X4PLUS_SHA256 = (
    "4fa0d38905f75ac06eb49a7951b426670021be3018265fd191d2125df9d682f1"
)
DEFAULT_REALESRGAN_CACHE = Path.home() / ".cache" / "realesrgan"
DEFAULT_REALESRGAN_WEIGHT = DEFAULT_REALESRGAN_CACHE / "RealESRGAN_x4plus.pth"
DEFAULT_TILE = 256
DEFAULT_TILE_PAD = 32


def _sha256_of_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _install_basicsr_torchvision_shim() -> None:
    """basicsr imports torchvision.transforms.functional_tensor which moved.

    Inject a shim before basicsr loads so import succeeds on torchvision >= 0.17.
    """
    if "torchvision.transforms.functional_tensor" in sys.modules:
        return
    try:
        import torchvision.transforms.functional as functional
    except ImportError as exc:  # pragma: no cover - environment guard
        raise IFCRenderError(f"torchvision required for ESRGAN: {exc}") from exc
    shim = types.ModuleType("torchvision.transforms.functional_tensor")
    shim.rgb_to_grayscale = functional.rgb_to_grayscale
    sys.modules["torchvision.transforms.functional_tensor"] = shim


def ensure_realesrgan_weight(
    weight_path: Path | str = DEFAULT_REALESRGAN_WEIGHT,
    weight_url: str = DEFAULT_REALESRGAN_WEIGHT_URL,
    *,
    expected_sha256: str | None = REALESRGAN_X4PLUS_SHA256,
) -> Path:
    """Ensure the RealESRGAN_x4plus weights exist locally and pass checksum.

    If the cache already contains the weight, its SHA256 is verified against
    `expected_sha256`; on mismatch (partial download, corrupted file, upstream
    substitution) the cached file is removed and re-downloaded. Downloads land
    on a `.partial` sibling first and only get renamed to the final path once
    the checksum verifies, so a fail-stop never leaves a half-written file
    that would be accepted by the next call.
    """
    path = Path(weight_path)
    if expected_sha256 is None:
        if path.exists():
            return path
        return _download_realesrgan_weight(path, weight_url, expected_sha256=None)
    if path.exists():
        actual = _sha256_of_file(path)
        if actual == expected_sha256:
            return path
        path.unlink()
    return _download_realesrgan_weight(path, weight_url, expected_sha256=expected_sha256)


def _download_realesrgan_weight(
    path: Path,
    weight_url: str,
    *,
    expected_sha256: str | None,
) -> Path:
    import urllib.request

    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_name(path.name + ".partial")
    if tmp_path.exists():
        tmp_path.unlink()
    try:
        urllib.request.urlretrieve(weight_url, tmp_path)
        if expected_sha256 is not None:
            actual = _sha256_of_file(tmp_path)
            if actual != expected_sha256:
                raise IFCRenderError(
                    "RealESRGAN weight checksum mismatch: "
                    f"got {actual}, want {expected_sha256}"
                )
        tmp_path.replace(path)
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise
    return path


class RealEsrganUpscaler:
    """Thin wrapper around realesrgan.RealESRGANer.

    Loads the RealESRGAN_x4plus model once and exposes a single
    :meth:`upscale_image` entry point that returns a PIL image at 4x scale.
    """

    def __init__(
        self,
        weight_path: Path | str = DEFAULT_REALESRGAN_WEIGHT,
        tile: int = DEFAULT_TILE,
        tile_pad: int = DEFAULT_TILE_PAD,
        half: bool = True,
        device: str | None = None,
    ) -> None:
        _install_basicsr_torchvision_shim()
        import torch as _torch
        from basicsr.archs.rrdbnet_arch import RRDBNet
        from realesrgan import RealESRGANer

        weight = ensure_realesrgan_weight(weight_path)
        if device is None:
            device = "cuda" if _torch.cuda.is_available() else "cpu"
        use_half = bool(half) and device.startswith("cuda")

        model = RRDBNet(
            num_in_ch=3,
            num_out_ch=3,
            num_feat=64,
            num_block=23,
            num_grow_ch=32,
            scale=4,
        )
        self.upsampler = RealESRGANer(
            scale=4,
            model_path=str(weight),
            model=model,
            tile=tile,
            tile_pad=tile_pad,
            half=use_half,
            device=device,
        )
        self.device = device
        self.weight_path = Path(weight)
        self.half = use_half
        self.tile = tile
        self.tile_pad = tile_pad

    def upscale_image(
        self,
        image: Image.Image,
        *,
        outscale: float = 4.0,
    ) -> Image.Image:
        import numpy as np

        rgb = image.convert("RGB")
        arr = np.asarray(rgb)
        bgr = arr[:, :, ::-1].copy()
        try:
            out_bgr, _ = self.upsampler.enhance(bgr, outscale=float(outscale))
        except Exception as exc:
            raise IFCRenderError(f"Real-ESRGAN upscale failed: {exc}") from exc
        out_rgb = out_bgr[:, :, ::-1]
        return Image.fromarray(out_rgb, mode="RGB")
