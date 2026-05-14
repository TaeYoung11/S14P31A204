class Polygon:
    is_valid: bool

    def __init__(self, coordinates: object) -> None: ...
    def buffer(self, distance: float) -> Polygon: ...
    def covers(self, other: object) -> bool: ...


def box(
    minx: float,
    miny: float,
    maxx: float,
    maxy: float,
) -> object: ...
