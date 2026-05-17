"""Phase H-3 postprocess helpers.

Real-ESRGAN 4x upscale for IFC2IMG photoreal outputs. Keeps geometry/color
exactly (no diffusion). Cheap and predictable sharpness/detail boost.
"""

from __future__ import annotations

import sys
import types
from pathlib import Path

from PIL import Image

from .exceptions import IFCRenderError

DEFAULT_REALESRGAN_WEIGHT_URL = (
    "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/"
    "RealESRGAN_x4plus.pth"
)
DEFAULT_REALESRGAN_CACHE = Path.home() / ".cache" / "realesrgan"
DEFAULT_REALESRGAN_WEIGHT = DEFAULT_REALESRGAN_CACHE / "RealESRGAN_x4plus.pth"
DEFAULT_TILE = 256
DEFAULT_TILE_PAD = 32


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
) -> Path:
    """Download the RealESRGAN_x4plus weights on first use."""
    path = Path(weight_path)
    if path.exists():
        return path
    import urllib.request

    path.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve(weight_url, path)
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
