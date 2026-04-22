"""Domain exceptions for img2img.

Plan:
    RenderError       — base for any rendering failure.
    InvalidInputError — raised when input cannot be coerced to a PIL image
                        (bad path, undecodable bytes, unsupported type).

MR2 adds: PresetNotFoundError(RenderError).
"""


class RenderError(Exception):
    """Base exception for img2img rendering errors."""


class InvalidInputError(RenderError):
    """Raised when input cannot be coerced to a valid PIL image."""
