# House_KR_nobathroom Measurements

## Purpose
This document records the measured geometry facts required before PR-A and PR-B.

Target fixture:
- `scripts/House_KR_nobathroom.ifc`

## Required Measurements

### Big Room
- polygon
- area
- exterior contact segments
- corridor adjacency segments
- entrance relationship
- existing corridor-facing door ids
- existing exterior window ids

### Constraints To Confirm
- Big Room has enough area to split into:
  - `서재`
  - `화장실`
- Big Room shares enough length with corridor for access
- Big Room shares enough length with exterior for a toilet window
- entrance-facing conflict is either absent or explicitly known

## Measurement Template

### Big Room polygon
- `[(300.0, 5990.0), (7410.0, 5990.0), (7410.0, 9700.0), (300.0, 9700.0)]`

### Big Room area
- `26,378,100 mm^2`

### Exterior contact segments
- `[(7410.0, 9700.0) -> (300.0, 9700.0)]` length `7110 mm`
- `[(300.0, 9700.0) -> (300.0, 5990.0)]` length `3710 mm`
- These were derived from the Big Room polygon boundary intersected with the floor outer boundary.

### Corridor adjacency segments
- Partition wall `3jjW3rL656ex34Gws22EfM`
- Segment `[(0.0, 5750.0) -> (7410.0, 5750.0)]` length `7410 mm`
- Note: the extracted room polygons do not touch directly because wall thickness remains between them, so this is recorded from the shared wall context instead of polygon-boundary overlap.

### Entrance relationship
- No exterior door was extracted on the Big Room exterior-contact segments.
- Current fixture indicates no direct entrance conflict on the Big Room exterior edge.

### Existing corridor-facing doors
- `['2qiPPF3FrF8OIqfrKiSUqm']`

### Existing exterior windows
- `['1srAI$R4T8ihLXSNHmUSET', '1TAI4ouKX4Xx4lBDZIu5qM']`

## Notes
- This document should contain measured values, not intent.
- PR-B should reference this file when split candidates are enumerated.
