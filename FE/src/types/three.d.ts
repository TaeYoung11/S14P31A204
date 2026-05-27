/**
 * Three.js JSM 컨트롤 모듈 타입 선언
 *
 * @thatopen/components와 함께 사용할 때 타입 정보가 없는 JSM 모듈에 대한
 * 최소한의 타입을 제공한다.
 */

declare module 'three/examples/jsm/controls/OrbitControls.js' {
  import type {
    OrthographicCamera,
    PerspectiveCamera,
    Vector3,
  } from 'three'

  export class OrbitControls {
    constructor(
      camera: PerspectiveCamera | OrthographicCamera,
      domElement?: HTMLElement,
    )
    enableDamping: boolean
    dampingFactor: number
    minDistance: number
    maxDistance: number
    target: Vector3
    update: () => void
    dispose: () => void
  }
}

/** 오브젝트 이동·회전·크기 조절 기즈모 컨트롤 타입 선언 */
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
