import { describe, expect, it } from 'vitest'
import {
  parseWebIfcToFloorProject,
  toRoomPolygonFromAabb,
  type Aabb3D,
  type WebIfcApiForFloorProject,
} from '@/features/editor/utils/webIfcToFloorProject'

describe('toRoomPolygonFromAabb', () => {
  it('uses X/Y as the floor-plane axes even when Z has the largest span', () => {
    const aabb: Aabb3D = {
      minX: 1,
      maxX: 3,
      minY: 10,
      maxY: 11,
      minZ: 0,
      maxZ: 5,
    }

    expect(toRoomPolygonFromAabb(aabb, 1000)).toEqual([
      { x: 1000, y: 10000 },
      { x: 3000, y: 10000 },
      { x: 3000, y: 11000 },
      { x: 1000, y: 11000 },
    ])
  })
})

describe('parseWebIfcToFloorProject', () => {
  const vector = <T,>(items: T[]) => ({
    size: () => items.length,
    get: (index: number) => items[index] as T,
  })

  it('prefers STEP space profile polygons over web-ifc AABB room boxes', () => {
    const studyName = '\uc11c\uc7ac'
    const roomType = '\ubc29'
    const ifcText = `
ISO-10303-21;
HEADER;
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#2=IFCSIUNIT(.LENGTHUNIT.,$,.METRE.);
#10=IFCBUILDINGSTOREY('storey-guid',$,'2F',$,$,$,$,$,$,0.);
#11=IFCRELAGGREGATES('rel-guid',$,$,$,#10,(#20));
#20=IFCSPACE('space-guid',$,'${studyName}',$,'${roomType}',#30,#40,$,$,$,$);
#30=IFCLOCALPLACEMENT($,#31);
#31=IFCAXIS2PLACEMENT3D(#32,$,$);
#32=IFCCARTESIANPOINT((0.,0.,0.));
#40=IFCPRODUCTDEFINITIONSHAPE($,$,(#41));
#41=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#42));
#42=IFCEXTRUDEDAREASOLID(#43,#50,#60,2.7);
#43=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#44);
#44=IFCPOLYLINE((#45,#46,#47,#48,#49,#50,#45));
#45=IFCCARTESIANPOINT((0.,0.));
#46=IFCCARTESIANPOINT((3.,0.));
#47=IFCCARTESIANPOINT((3.,1.));
#48=IFCCARTESIANPOINT((1.,1.));
#49=IFCCARTESIANPOINT((1.,2.));
#50=IFCCARTESIANPOINT((0.,2.));
#60=IFCDIRECTION((0.,0.,1.));
ENDSEC;
END-ISO-10303-21;
`

    const typeCodes = new Map([
      ['IFCBUILDINGSTOREY', 1],
      ['IFCSIUNIT', 2],
    ])
    const typeNames = new Map(Array.from(typeCodes.entries()).map(([name, code]) => [code, name]))
    const ifcApi: WebIfcApiForFloorProject = {
      GetTypeCodeFromName: (typeName) => typeCodes.get(typeName) ?? 999,
      GetNameFromTypeCode: (typeCode) => typeNames.get(typeCode) ?? 'UNKNOWN',
      GetLineIDsWithType: (_modelID, type) => (type === 1 ? vector([10]) : vector([])),
      GetLine: (_modelID, expressID) => (
        expressID === 10
          ? { GlobalId: 'storey-guid', Name: '2F', Elevation: 0, type: 1 }
          : { type: 999 }
      ),
    }

    const result = parseWebIfcToFloorProject({
      ifcApi,
      modelId: 1,
      sourceName: 'l-shape.ifc',
      ifcText,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.message)
    expect(result.project.rooms).toHaveLength(1)
    expect(result.project.rooms[0]).toMatchObject({
      id: 'space-guid',
      name: studyName,
      type: roomType,
      floor: 'storey-guid',
    })
    expect(result.project.rooms[0].polygon).toEqual([
      { x: 0, y: 0 },
      { x: 3000, y: 0 },
      { x: 3000, y: 1000 },
      { x: 1000, y: 1000 },
      { x: 1000, y: 2000 },
      { x: 0, y: 2000 },
    ])
  })
})

