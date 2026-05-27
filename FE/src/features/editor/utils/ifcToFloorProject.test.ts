import { describe, expect, it } from 'vitest'
import { parseIfcToFloorProject } from './ifcToFloorProject'

describe('parseIfcToFloorProject wall geometry', () => {
  it('uses rectangle profile placement as wall body origin offset', () => {
    const ifcText = `
      ISO-10303-21;
      HEADER;
      FILE_SCHEMA(('IFC4'));
      ENDSEC;
      DATA;
      #1=IFCWALL('wall-1',$,'Wall',$,$,#10,#20,$,$);
      #2=IFCBUILDINGSTOREY('storey-1',$,'1F',$,$,$,$,$,.ELEMENT.,0.);
      #10=IFCLOCALPLACEMENT($,#11);
      #11=IFCAXIS2PLACEMENT3D(#12,#13,#14);
      #12=IFCCARTESIANPOINT((1000.,2000.,0.));
      #13=IFCDIRECTION((0.,0.,1.));
      #14=IFCDIRECTION((1.,0.,0.));
      #20=IFCPRODUCTDEFINITIONSHAPE($,$,(#21));
      #21=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#22));
      #22=IFCEXTRUDEDAREASOLID(#23,#27,#29,2400.);
      #23=IFCRECTANGLEPROFILEDEF(.AREA.,$,#24,3000.,200.);
      #24=IFCAXIS2PLACEMENT2D(#25,#26);
      #25=IFCCARTESIANPOINT((1500.,100.));
      #26=IFCDIRECTION((1.,0.));
      #27=IFCAXIS2PLACEMENT3D(#28,#13,#14);
      #28=IFCCARTESIANPOINT((0.,0.,0.));
      #29=IFCDIRECTION((0.,0.,1.));
      #30=IFCRELCONTAINEDINSPATIALSTRUCTURE('rel-1',$,$,$,(#1),#2);
      ENDSEC;
      END-ISO-10303-21;
    `

    const parsed = parseIfcToFloorProject(ifcText, 'wall-origin.ifc')

    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.project.walls).toHaveLength(1)
    expect(parsed.project.walls?.[0]?.start.x).toBe(1000)
    expect(parsed.project.walls?.[0]?.end.x).toBe(4000)
  })
})
