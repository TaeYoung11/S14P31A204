/**
 * 지붕(roof) 편집용 geometry 생성 유틸.
 */
export function createGableRoofGeometry(
  THREE: typeof import('three'),
  params: { length: number; height: number; thickness: number },
): import('three').BufferGeometry {
  const { length, height, thickness } = params
  const halfLength = length / 2
  const halfThickness = thickness / 2

  const roofGeometry = new THREE.BufferGeometry()
  roofGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([
      -halfLength, 0, -halfThickness,
      halfLength, 0, -halfThickness,
      0, height, -halfThickness,
      -halfLength, 0, halfThickness,
      halfLength, 0, halfThickness,
      0, height, halfThickness,
    ], 3),
  )
  roofGeometry.setIndex([
    0, 1, 2,
    3, 5, 4,
    0, 3, 4,
    0, 4, 1,
    1, 4, 5,
    1, 5, 2,
    2, 5, 3,
    2, 3, 0,
  ])
  roofGeometry.computeVertexNormals()
  return roofGeometry
}
