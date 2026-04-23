"""Default hyperparameters and model choice.

Plan:
    Module-level constants used by RenderParams defaults and preprocess.
    MR3 re-tunes DEFAULT_STRENGTH / DEFAULT_GUIDANCE_SCALE / DEFAULT_NEGATIVE
    after the sweep lands.
"""

DEFAULT_MODEL_ID = "runwayml/stable-diffusion-v1-5"

DEFAULT_STRENGTH = 0.65
DEFAULT_GUIDANCE_SCALE = 7.5
DEFAULT_NUM_INFERENCE_STEPS = 25

DEFAULT_NEGATIVE = (
    "3d render, cgi, blender render, untextured, matte gray, "
    "plastic look, lowres, blurry, deformed"
)

DEFAULT_LONG_SIDE = 768
