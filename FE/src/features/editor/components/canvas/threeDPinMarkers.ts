import type { FloorCommentPin } from '../../types'

type ThreeModule = typeof import('three')
type ThreePinAction = 'select' | 'delete'

export interface ThreeDPinMarkerHit {
  pinId: string
  action: ThreePinAction
}

interface ThreeDPinMarkerOptions {
  selectedPinId: string | null
  currentUserId: string | null
  deletingPinId: string | null
  worldUnitsPerMm: number
}

const createPinMarker = (
  THREE: ThreeModule,
  pin: FloorCommentPin,
  index: number,
  options: ThreeDPinMarkerOptions,
  worldUnitsPerMm: number,
) => {
  const isSelected = options.selectedPinId === pin.id
  const canDelete =
    isSelected &&
    Boolean(options.currentUserId) &&
    pin.createdById === options.currentUserId
  const isDeleting = options.deletingPinId === pin.id
  const group = new THREE.Group()
  group.name = `comment-pin-${pin.id}`
  group.userData.commentPinId = pin.id
  group.userData.commentPinAction = 'select'

  const x = pin.worldX * worldUnitsPerMm
  const y = pin.worldZ * worldUnitsPerMm
  const z = pin.worldY * worldUnitsPerMm
  group.position.set(x, y, z)

  const color = isSelected ? '#3B45B3' : '#1C1C1E'
  const stemMaterial = new THREE.MeshBasicMaterial({ color, transparent: isDeleting, opacity: isDeleting ? 0.45 : 1 })
  const headMaterial = new THREE.MeshBasicMaterial({ color, transparent: isDeleting, opacity: isDeleting ? 0.45 : 1 })
  const labelMaterial = new THREE.SpriteMaterial({
    map: createPinLabelTexture(THREE, String(index + 1)),
    depthTest: false,
    depthWrite: false,
  })

  const stemRadius = 18 * worldUnitsPerMm
  const stemHeight = 900 * worldUnitsPerMm
  const headRadius = 140 * worldUnitsPerMm
  const labelSize = 340 * worldUnitsPerMm

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(stemRadius, stemRadius, stemHeight, 12), stemMaterial)
  stem.position.y = stemHeight / 2
  group.add(stem)

  const head = new THREE.Mesh(new THREE.SphereGeometry(headRadius, 20, 20), headMaterial)
  head.position.y = stemHeight + headRadius * 0.6
  group.add(head)

  const label = new THREE.Sprite(labelMaterial)
  label.position.y = head.position.y + 2 * worldUnitsPerMm
  label.scale.set(labelSize * 1.08, labelSize * 1.08, 1)
  label.renderOrder = 10
  group.add(label)

  if (canDelete) {
    const deleteGroup = new THREE.Group()
    deleteGroup.name = `comment-pin-delete-${pin.id}`
    deleteGroup.position.set(260 * worldUnitsPerMm, stemHeight + 260 * worldUnitsPerMm, 0)
    deleteGroup.userData.commentPinId = pin.id
    deleteGroup.userData.commentPinAction = 'delete'

    const deleteSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: createDeleteButtonTexture(THREE),
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: isDeleting ? 0.55 : 1,
    }))
    deleteSprite.scale.set(280 * worldUnitsPerMm, 280 * worldUnitsPerMm, 1)
    deleteSprite.renderOrder = 11
    deleteGroup.add(deleteSprite)

    group.add(deleteGroup)
  }

  return group
}

const createPinLabelTexture = (THREE: ThreeModule, text: string) => {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#FFFFFF'
    context.font = '700 58px Arial'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(text, canvas.width / 2, canvas.height / 2)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

const createDeleteButtonTexture = (THREE: ThreeModule) => {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#FFFFFF'
    context.beginPath()
    context.arc(64, 64, 44, 0, Math.PI * 2)
    context.fill()

    context.strokeStyle = '#D94848'
    context.lineWidth = 8
    context.beginPath()
    context.arc(64, 64, 42, 0, Math.PI * 2)
    context.stroke()

    context.strokeStyle = '#D94848'
    context.lineWidth = 10
    context.lineCap = 'round'
    context.beginPath()
    context.moveTo(49, 49)
    context.lineTo(79, 79)
    context.moveTo(79, 49)
    context.lineTo(49, 79)
    context.stroke()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

export const syncThreeDPinMarkers = (
  THREE: ThreeModule,
  markerGroup: import('three').Group,
  pins: FloorCommentPin[],
  options: ThreeDPinMarkerOptions,
) => {
  markerGroup.traverse((object) => {
    const mesh = object as import('three').Mesh
    const material = mesh.material as import('three').Material | import('three').Material[] | undefined
    mesh.geometry?.dispose()
    if (Array.isArray(material)) {
      material.forEach(disposeMaterial)
    } else {
      disposeMaterial(material)
    }
  })
  markerGroup.clear()
  pins.forEach((pin, index) => {
    markerGroup.add(createPinMarker(THREE, pin, index, options, options.worldUnitsPerMm))
  })
}

const disposeMaterial = (material?: import('three').Material) => {
  const materialWithMap = material as (import('three').Material & {
    map?: { dispose?: () => void }
  }) | undefined
  materialWithMap?.map?.dispose?.()
  material?.dispose()
}

export const getThreeDPinMarkerHit = (object: import('three').Object3D | null | undefined): ThreeDPinMarkerHit | null => {
  let current = object
  while (current) {
    const pinId = current.userData.commentPinId
    const action = current.userData.commentPinAction
    if (typeof pinId === 'string' && (action === 'select' || action === 'delete')) {
      return { pinId, action }
    }
    current = current.parent ?? null
  }
  return null
}
