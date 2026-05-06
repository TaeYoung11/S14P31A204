declare module 'three' {
  export class Object3D {
    name: string
    children: Object3D[]
    rotation: { x: number; y: number; z: number }
    parent?: Object3D | null
    userData: Record<string, unknown>
    position: { x: number; y: number; z: number; set: (x: number, y: number, z: number) => void; copy: (value: Vector3) => void }
    scale: { x: number; y: number; z: number; set: (x: number, y: number, z: number) => void }
    add: (...objects: Object3D[]) => this
    clear: () => this
    remove: (...objects: Object3D[]) => this
    traverse: (callback: (object: Object3D) => void) => void
  }

  export class Group extends Object3D {}

  export class Scene extends Object3D {
    background: unknown
  }

  export class PerspectiveCamera extends Object3D {
    constructor(fov: number, aspect: number, near: number, far: number)
    aspect: number
    lookAt: (x: number, y: number, z: number) => void
    updateProjectionMatrix: () => void
  }

  export class WebGLRenderer {
    constructor(options?: { antialias?: boolean; alpha?: boolean })
    domElement: HTMLCanvasElement
    setPixelRatio: (ratio: number) => void
    setSize: (width: number, height: number) => void
    render: (scene: Scene, camera: PerspectiveCamera) => void
    dispose: () => void
  }

  export class AmbientLight extends Object3D {
    constructor(color: string, intensity?: number)
  }

  export class DirectionalLight extends Object3D {
    constructor(color: string, intensity?: number)
  }

  export class BoxGeometry {
    constructor(width?: number, height?: number, depth?: number)
    dispose: () => void
  }

  export class CylinderGeometry {
    constructor(
      radiusTop?: number,
      radiusBottom?: number,
      height?: number,
      radialSegments?: number,
    )
    dispose: () => void
  }

  export class ConeGeometry {
    constructor(radius?: number, height?: number, radialSegments?: number)
    dispose: () => void
  }

  export class SphereGeometry {
    constructor(radius?: number, widthSegments?: number, heightSegments?: number)
    dispose: () => void
  }

  export class Material {
    dispose: () => void
  }

  export class Texture {
    wrapS: number
    wrapT: number
    repeat: { set: (x: number, y: number) => void }
    dispose: () => void
  }

  export class CanvasTexture extends Texture {
    constructor(canvas: HTMLCanvasElement)
  }

  export const RepeatWrapping: number

  export class MeshStandardMaterial extends Material {
    constructor(parameters?: {
      color?: string
      map?: Texture
      transparent?: boolean
      opacity?: number
      roughness?: number
      metalness?: number
    })
  }

  export class Mesh extends Object3D {
    constructor(geometry: BoxGeometry | ConeGeometry | CylinderGeometry | SphereGeometry, material: Material)
    geometry: BoxGeometry | ConeGeometry | CylinderGeometry | SphereGeometry
    material: Material | Material[]
  }

  export class Vector2 {
    constructor(x?: number, y?: number)
  }

  export class Vector3 {
    constructor(x?: number, y?: number, z?: number)
    x: number
    y: number
    z: number
    set: (x: number, y: number, z: number) => void
    copy: (value: Vector3) => void
  }

  export class Box3 {
    constructor()
    setFromObject: (object: Object3D) => Box3
    getSize: (target: Vector3) => Vector3
    getCenter: (target: Vector3) => Vector3
  }

  export class Raycaster {
    setFromCamera: (
      coords: Vector2,
      camera: PerspectiveCamera | OrthographicCamera,
    ) => void
    intersectObjects: (objects: Object3D[], recursive?: boolean) => Array<{ object: Object3D }>
  }

  export class OrthographicCamera extends Object3D {}
}

declare module 'three/examples/jsm/controls/TransformControls.js' {
  import type {
    Object3D,
    OrthographicCamera,
    PerspectiveCamera,
  } from 'three'

  export class TransformControls extends Object3D {
    constructor(
      camera: PerspectiveCamera | OrthographicCamera,
      domElement: HTMLElement,
    )
    visible: boolean
    enabled: boolean
    setMode: (mode: 'translate' | 'rotate' | 'scale') => void
    attach: (object: Object3D) => void
    detach: () => void
    getHelper: () => Object3D
  }
}
