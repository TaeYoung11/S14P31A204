"""Domain exceptions for img2img.

Plan:
    RenderError         — base for any rendering failure.
    InvalidInputError   — raised when input cannot be coerced to a PIL image
                          (bad path, undecodable bytes, unsupported type).
    PresetNotFoundError — raised on any preset load failure (missing file,
                          YAML parse error, missing required field, or
                          unknown field in YAML).
"""


class RenderError(Exception):
    """Base exception for img2img rendering errors."""


class InvalidInputError(RenderError):
    """Raised when input cannot be coerced to a valid PIL image."""


class PresetNotFoundError(RenderError):
    """Raised on any preset load failure.

    Covers: preset name not resolvable to a file, YAML parse error,
    malformed YAML structure, missing required field, or unknown field
    violating the preset schema.
    """
