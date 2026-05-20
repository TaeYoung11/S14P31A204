import { describe, expect, it } from 'vitest'
import {
  expandIfcStoreysForVisibility,
  parseBatangDimensionProperties,
  parseIfcStoreys,
} from '@/features/editor/components/canvas/thatopen/ifcPropertyParser'
import { buildIfcCanonicalIdMap } from '@/features/editor/components/canvas/thatopen/ifcSceneHelpers'

const sampleIfc = `
#10=IFCWALLSTANDARDCASE('wall-1',#1,'1F Wall',$,$,#30,#11,'10',$);
#11=IFCPRODUCTDEFINITIONSHAPE($,$,(#12,#13));
#12=IFCSHAPEREPRESENTATION($,'Axis','Curve2D',(#14));
#13=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#15));
#20=IFCWALLSTANDARDCASE('wall-2',#1,'2F Wall',$,$,#40,#21,'20',$);
#21=IFCPRODUCTDEFINITIONSHAPE($,$,(#22,#23));
#22=IFCSHAPEREPRESENTATION($,'Axis','Curve2D',(#24));
#23=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#25));
#100=IFCBUILDINGSTOREY('storey-1',#1,'1F',$,$,#101,$,'1F',.ELEMENT.,0.);
#200=IFCBUILDINGSTOREY('storey-2',#1,'2F',$,$,#201,$,'2F',.ELEMENT.,2500.);
#300=IFCRELCONTAINEDINSPATIALSTRUCTURE('rel-1',#1,$,$,(#10),#100);
#301=IFCRELCONTAINEDINSPATIALSTRUCTURE('rel-2',#1,$,$,(#20),#200);
`

describe('IFC storey visibility ids', () => {
  it('keeps hierarchy ids as products but expands hider ids to wall geometry aliases', () => {
    const metrics = parseBatangDimensionProperties(sampleIfc)
    const aliases = buildIfcCanonicalIdMap(metrics)
    const storeys = expandIfcStoreysForVisibility(
      parseIfcStoreys(sampleIfc),
      aliases.localIdsByExpressId,
      metrics.byId,
    )

    expect(storeys).toHaveLength(2)
    expect(Array.from(storeys[0].elementLocalIds)).toEqual([10])
    expect(storeys[0].elements?.map((element) => element.localId)).toEqual([10])
    expect(Array.from(storeys[0].visibilityLocalIds ?? []).sort((a, b) => a - b)).toEqual([
      10,
      11,
      12,
      13,
      14,
      15,
      30,
    ])
    expect(Array.from(storeys[1].visibilityLocalIds ?? []).sort((a, b) => a - b)).toEqual([
      20,
      21,
      22,
      23,
      24,
      25,
      40,
    ])
  })
})
