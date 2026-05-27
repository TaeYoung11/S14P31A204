/**
 * ifcSceneHelpers — ThatOpenIfcCanvas 씬 헬퍼 순수 함수 모음
 *
 * ThatOpenIfcCanvas 컴포넌트에서 사용되는 순수 함수와 공유 타입을 분리한 파일.
 * React 의존성이 없으며, Three.js / @thatopen/components 씬 조작만 담당한다.
 *
 * 내용:
 *  - 공유 타입: Selected3DTarget, IfcEditableObject3D, ThatOpenSceneState
 *  - 시그니처 유틸: 변경 감지용 문자열 키 생성
 *  - IFC 로드 유틸: 모델 ID 생성, IFC 텍스트 fetch
 *  - 카메라/씬 헬퍼: 클리핑 평면 조정, 카메라 피팅
 *  - 오브젝트 헬퍼: 편집 루트 탐색, 재질/투명도 적용, 선택 해제
 *  - 치수/좌표 헬퍼: 크기 계산, 월드 단위 추정, 좌표 반올림
 *  - 재질 헬퍼: 초기 재질 스타일 적용, IFC 색상 오버라이드, TransformProxy 생성
 */
import type { Object3D } from "three";
import type { IfcElementInfo } from "../../../types";
import type { IfcPsetMetricMaps } from "./ifcPropertyParser";
import { logEditor3dUndoDebug } from "../../../utils/editor3dUndoDebug";
import {
  PROJECT_WORLD_UNITS_PER_MM,
  createElementMaterial,
  type MaybeThatOpenMaterialsManager,
  type ThreeModule,
} from "./ifcMaterials";
const IFC_MOVE_DEBUG = false;
const IFC_MOVE_USE_MODEL_OPACITY_API = false;
const IFC_MOVE_USE_MODEL_VISIBILITY_API = true;
const traceIfcMoveVisibility = (
  _event: string,
  _payload?: Record<string, unknown>,
) => {};

// ─────────────────────────────────────────────────────────────────────────────
// 공유 타입 정의
// ─────────────────────────────────────────────────────────────────────────────

/** 씬에서 현재 선택된 3D 오브젝트의 출처와 메타데이터 */
export type Selected3DTarget =
  | {
      source: 'ifc'
      modelId: string
      localId: number
      hitLocalId: number
      hitItemId?: number
      object?: Object3D
      keepModelHiddenAfterCommit?: boolean
      visibilityRestoredAtCommit?: boolean
      selectedSignature?: string
      selectedColorSignature?: string
      selectedMaterialSignature?: string
      selectedShapeSignature?: string;
      selectedTransformSignature?: string;
    }
  | {
      source: 'library'
      object: Object3D
      selectedSignature?: string
      selectedColorSignature?: string
      selectedMaterialSignature?: string
      selectedShapeSignature?: string;
      selectedTransformSignature?: string
    }
  | null;

const summarizeClearSelectedTargetFor3dUndo = (
  target: Selected3DTarget,
): Record<string, unknown> | null => {
  if (!target) return null;
  const object = target.object as IfcEditableObject3D | undefined;
  const editTarget = object?.userData?.ifcEditTarget;
  return {
    source: target.source,
    modelId: target.source === "ifc" ? target.modelId : null,
    localId: target.source === "ifc" ? target.localId : null,
    hitLocalId: target.source === "ifc" ? target.hitLocalId : null,
    objectVisible: object?.visible ?? null,
    keepModelHiddenAfterCommit:
      target.source === "ifc"
        ? Boolean(target.keepModelHiddenAfterCommit ?? object?.userData?.ifcKeepModelHiddenAfterCommit)
        : null,
    visibilityRestoredAtCommit:
      target.source === "ifc" ? target.visibilityRestoredAtCommit ?? null : null,
    editTargetLocalIds: editTarget?.localIds ?? [],
    element: editTarget?.element
      ? {
          id: editTarget.element.id,
          globalId: editTarget.element.globalId ?? null,
          expressId: editTarget.element.expressId ?? null,
          ifcClass: editTarget.element.ifcClass,
        }
      : null,
  };
};

export type TransformAxisVisibility = {
  showX: boolean
  showY: boolean
  showZ: boolean
}

type TransformTargetSource = NonNullable<Selected3DTarget>['source'] | null | undefined
type TransformMode = 'translate' | 'rotate' | 'scale' | string
type RotationDegrees = {
  x?: number | null
  y?: number | null
  z?: number | null
} | null | undefined
type QuaternionLike = {
  x: number
  y: number
  z: number
  w: number
} | null | undefined
type AxisLike = {
  x?: number | null
  y?: number | null
  z?: number | null
}

const ROTATION_EPSILON_DEGREES = 1e-6

const isNonZeroRotation = (value: number | null | undefined) => (
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) > ROTATION_EPSILON_DEGREES
)

export type IfcRotationAxisAngle = {
  axis: {
    x: number
    y: number
    z: number
  }
  angle_degrees: number
  frame: 'IFC_WORLD'
  pivot: 'BBOX_CENTER'
}

export const getTransformAxisVisibility = (
  targetSource: TransformTargetSource,
  transformMode: TransformMode,
): TransformAxisVisibility => {
  if (targetSource === 'ifc' && transformMode === 'rotate') {
    return { showX: true, showY: true, showZ: true }
  }
  return { showX: true, showY: true, showZ: true }
}

export const toIfcYawRotationDegrees = (rotationDegrees: RotationDegrees): { y?: number } => {
  const y = rotationDegrees?.y
  if (!isNonZeroRotation(y)) return {}
  if (isNonZeroRotation(rotationDegrees?.x) || isNonZeroRotation(rotationDegrees?.z)) {
    return {}
  }
  return { y: y as number }
}

const normalizeAxis = (axis: AxisLike): { x: number; y: number; z: number } | null => {
  const x = typeof axis.x === 'number' && Number.isFinite(axis.x) ? axis.x : 0
  const y = typeof axis.y === 'number' && Number.isFinite(axis.y) ? axis.y : 0
  const z = typeof axis.z === 'number' && Number.isFinite(axis.z) ? axis.z : 0
  const length = Math.hypot(x, y, z)
  if (!Number.isFinite(length) || length <= 1e-8) return null
  return { x: x / length, y: y / length, z: z / length }
}

export const threeWorldAxisToIfcWorldAxis = (axis: AxisLike): { x: number; y: number; z: number } | null => {
  const normalized = normalizeAxis(axis)
  if (!normalized) return null
  return normalizeAxis({
    x: normalized.x,
    y: normalized.z,
    z: normalized.y,
  })
}

export const toIfcRotationAxisAngle = (quaternion: QuaternionLike): IfcRotationAxisAngle | null => {
  if (!quaternion) return null
  const length = Math.hypot(quaternion.x, quaternion.y, quaternion.z, quaternion.w)
  if (!Number.isFinite(length) || length <= 1e-8) return null

  let x = quaternion.x / length
  let y = quaternion.y / length
  let z = quaternion.z / length
  const w = quaternion.w / length
  const vectorLength = Math.hypot(x, y, z)
  if (!Number.isFinite(vectorLength) || vectorLength <= 1e-8) return null

  let angle = 2 * Math.atan2(vectorLength, w)
  if (angle > Math.PI) {
    angle = Math.PI * 2 - angle
    x = -x
    y = -y
    z = -z
  }
  const angleDegrees = (angle * 180) / Math.PI
  if (!isNonZeroRotation(angleDegrees)) return null

  const axis = threeWorldAxisToIfcWorldAxis({
    x: x / vectorLength,
    y: y / vectorLength,
    z: z / vectorLength,
  })
  if (!axis) return null
  return {
    axis,
    angle_degrees: angleDegrees,
    frame: 'IFC_WORLD',
    pivot: 'BBOX_CENTER',
  }
}

/** ifcEditTarget userData를 가진 편집 프록시 오브젝트 타입 */
export type IfcEditableObject3D = Object3D & {
  userData: {
    ifcEditTarget?: {
      modelId: string;
      localId: number;
      hitLocalId: number;
      hitItemId?: number;
      localIds?: number[];
      element: IfcElementInfo;
    };
    ifcEditBaseWorldSize?: {
      x: number;
      y: number;
      z: number;
    };
    [key: string]: unknown;
  };
};

/** IFC 요소 식별자 표준화 맵 */
export type IfcCanonicalIdMap = {
  expressIdByLocalId: Map<number, number>;
  localIdsByExpressId: Map<number, Set<number>>;
};

/** IFC 이동 상태기계 단계 */
export type IfcMovePhase = "idle" | "dragging" | "commit" | "cleanup";

/** IFC 이동 상태기계 상태 */
export type IfcMoveLifecycleState = {
  phase: IfcMovePhase;
  targetKey: string | null;
  lastError: string | null;
};

/** IFC 이동 상태 전이 이벤트 */
export type IfcMoveTransitionEvent =
  | { type: "start_drag"; targetKey: string }
  | { type: "commit_start"; targetKey: string }
  | { type: "commit_success"; targetKey: string }
  | { type: "commit_failure"; targetKey: string; message: string }
  | { type: "cleanup_done" };

/** Session 기반 transform phase */
export type TransformSessionPhase =
  | "idle"
  | "attached"
  | "dragging"
  | "commit"
  | "cleanup";

/** Session 기반 transform runtime delta */
export type TransformRuntimeDelta = {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
};

/** Session 기반 transform snapshot */
export type TransformCommitSnapshot = {
  targetId: number;
  transformSessionId: string;
  committedAt: number;
};

/** Session 기반 transform runtime state */
export type TransformRuntimeState = {
  selectedTargetId: number | null;
  activeTransformTargetId: number | null;
  transformSessionId: string | null;
  phase: TransformSessionPhase;
  runtimeDelta: TransformRuntimeDelta | null;
  pendingCommitSessionId: string | null;
  lastCommittedSnapshot: TransformCommitSnapshot | null;
  lastError: string | null;
};

/** Session 기반 transform state 전이 액션 */
export type TransformStateAction =
  | { type: "SELECT_TARGET"; targetId: number | null }
  | { type: "ATTACH_GIZMO"; targetId: number }
  | { type: "START_DRAG"; targetId: number; transformSessionId: string }
  | {
      type: "UPDATE_DELTA";
      transformSessionId: string;
      delta: TransformRuntimeDelta;
    }
  | { type: "REQUEST_COMMIT"; transformSessionId: string }
  | {
      type: "COMMIT_SUCCESS";
      transformSessionId: string;
      targetId: number;
      committedAt?: number;
    }
  | { type: "COMMIT_FAIL"; transformSessionId: string; message: string }
  | { type: "CANCEL_TRANSFORM"; reason: string }
  | { type: "CLEANUP"; transformSessionId?: string };

/** 초기 transform runtime state */
export const createInitialTransformRuntimeState =
  (): TransformRuntimeState => ({
    selectedTargetId: null,
    activeTransformTargetId: null,
    transformSessionId: null,
    phase: "idle",
    runtimeDelta: null,
    pendingCommitSessionId: null,
    lastCommittedSnapshot: null,
    lastError: null,
  });

/** Session 기반 transform state reducer */
export const nextTransformRuntimeState = (
  current: TransformRuntimeState,
  action: TransformStateAction,
): TransformRuntimeState => {
  if (action.type === "SELECT_TARGET") {
    return {
      ...current,
      selectedTargetId: action.targetId,
    };
  }
  if (action.type === "ATTACH_GIZMO") {
    const isLockedBySession =
      (current.phase === "dragging" ||
        current.phase === "commit" ||
        current.phase === "cleanup") &&
      Number.isFinite(current.activeTransformTargetId);
    if (
      isLockedBySession &&
      current.activeTransformTargetId !== action.targetId
    ) {
      return {
        ...current,
        selectedTargetId: action.targetId,
      };
    }
    return {
      ...current,
      selectedTargetId: action.targetId,
      activeTransformTargetId: action.targetId,
      phase: current.phase === "idle" ? "attached" : current.phase,
      lastError: null,
    };
  }
  if (action.type === "START_DRAG") {
    const targetId = Number.isFinite(current.activeTransformTargetId)
      ? current.activeTransformTargetId
      : current.selectedTargetId;
    if (!Number.isFinite(targetId) || targetId !== action.targetId)
      return current;
    return {
      ...current,
      activeTransformTargetId: action.targetId,
      transformSessionId: action.transformSessionId,
      pendingCommitSessionId: null,
      phase: "dragging",
      runtimeDelta: null,
      lastError: null,
    };
  }
  if (action.type === "UPDATE_DELTA") {
    if (current.phase !== "dragging") return current;
    if (current.transformSessionId !== action.transformSessionId)
      return current;
    return {
      ...current,
      runtimeDelta: action.delta,
    };
  }
  if (action.type === "REQUEST_COMMIT") {
    if (current.phase !== "dragging") return current;
    if (current.transformSessionId !== action.transformSessionId)
      return current;
    return {
      ...current,
      phase: "commit",
      pendingCommitSessionId: action.transformSessionId,
    };
  }
  if (action.type === "COMMIT_SUCCESS") {
    if (current.pendingCommitSessionId !== action.transformSessionId)
      return current;
    return {
      ...current,
      phase: "cleanup",
      lastError: null,
      lastCommittedSnapshot: {
        targetId: action.targetId,
        transformSessionId: action.transformSessionId,
        committedAt: action.committedAt ?? Date.now(),
      },
    };
  }
  if (action.type === "COMMIT_FAIL") {
    if (current.pendingCommitSessionId !== action.transformSessionId)
      return current;
    return {
      ...current,
      phase: "cleanup",
      lastError: action.message,
    };
  }
  if (action.type === "CANCEL_TRANSFORM") {
    return {
      ...current,
      phase: "cleanup",
      lastError: action.reason,
      runtimeDelta: null,
      pendingCommitSessionId: null,
      transformSessionId: null,
    };
  }
  if (action.type === "CLEANUP") {
    if (
      action.transformSessionId &&
      current.transformSessionId !== action.transformSessionId
    )
      return current;
    return {
      ...current,
      activeTransformTargetId: null,
      transformSessionId: null,
      pendingCommitSessionId: null,
      runtimeDelta: null,
      phase: "idle",
    };
  }
  return current;
};

/**
 * ThatOpenIfcCanvas 씬 전체 상태를 담는 타입.
 * useRef로 관리되며 렌더 사이클 외부에서도 접근 가능하다.
 */
export type ThatOpenSceneState = {
  three: ThreeModule;
  scene: import("three").Scene;
  camera:
    | import("three").PerspectiveCamera
    | import("three").OrthographicCamera;
  renderer: import("three").WebGLRenderer;
  fragments: import("@thatopen/components").FragmentsManager;
  ifcLoader: import("@thatopen/components").IfcLoader;
  hider: import("@thatopen/components").Hider;
  raycaster: import("@thatopen/components").SimpleRaycaster;
  transformControls: import("three/examples/jsm/controls/TransformControls.js").TransformControls;
  contentGroup: import("three").Group;
  ifcEditGroup: import("three").Group;
  ifcObject: Object3D;
  modelId: string;
  worldUnitsPerMm: number;
  materialsManager?: MaybeThatOpenMaterialsManager;
  worldCamera?: {
    fitToItems?: () => Promise<void> | void;
  };
  cameraControls?: {
    azimuthRotateSpeed: number;
    polarRotateSpeed: number;
    setLookAt?: (
      positionX: number,
      positionY: number,
      positionZ: number,
      targetX: number,
      targetY: number,
      targetZ: number,
      enableTransition?: boolean,
    ) => Promise<void> | void;
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// 시그니처 유틸: 선택 상태 변경 여부를 빠르게 비교하기 위한 문자열 키 생성
// ─────────────────────────────────────────────────────────────────────────────

/** 치수(길이·높이·두께) 기반 변경 감지용 시그니처 */
export const getElementDimensionSignature = (element?: IfcElementInfo | null) =>
  [
    element?.id ?? "",
    element?.lengthMm ?? "",
    element?.heightMm ?? "",
    element?.thicknessMm ?? "",
  ].join(":");

/** 색상 변경 감지용 시그니처 */
export const getElementColorSignature = (element?: IfcElementInfo | null) =>
  [element?.id ?? "", element?.color ?? ""].join(":");

/** 재질 변경 감지용 시그니처 */
export const getElementMaterialSignature = (element?: IfcElementInfo | null) =>
  [element?.id ?? "", element?.material ?? ""].join(":");

/** 빈 canonical ID 맵을 생성한다. */
export const createEmptyIfcCanonicalIdMap = (): IfcCanonicalIdMap => ({
  expressIdByLocalId: new Map<number, number>(),
  localIdsByExpressId: new Map<number, Set<number>>(),
});

/**
 * IFC 파싱 메트릭으로 expressId <-> localId canonical 매핑을 구축한다.
 * - byId 키(localId)와 내부 expressId를 모두 반영한다.
 */
export const buildIfcCanonicalIdMap = (
  psetMetrics: IfcPsetMetricMaps,
): IfcCanonicalIdMap => {
  const map = createEmptyIfcCanonicalIdMap();
  Object.entries(psetMetrics.byId).forEach(([localIdKey, info]) => {
    const localId = Number(localIdKey);
    const expressId = info?.expressId;
    if (!Number.isFinite(localId) || !Number.isFinite(expressId)) return;
    map.expressIdByLocalId.set(localId, expressId);
    const existingLocalIds = map.localIdsByExpressId.get(expressId);
    if (existingLocalIds) {
      existingLocalIds.add(localId);
      return;
    }
    map.localIdsByExpressId.set(expressId, new Set<number>([localId]));
  });
  return map;
};

/**
 * IFC 이동 커밋 대상 localId 후보를 canonical 규칙으로 계산한다.
 * 우선순위: item 매핑 > 프록시 localIds > hit/local/express 기반 확장.
 */
export const resolveIfcCanonicalLocalIds = (
  canonicalMap: IfcCanonicalIdMap,
  params: {
    hitLocalId?: number;
    localId?: number;
    expressId?: number;
    proxyLocalIds?: number[];
    itemMappedLocalIds?: number[];
  },
) => {
  const {
    hitLocalId,
    localId,
    expressId,
    proxyLocalIds = [],
    itemMappedLocalIds = [],
  } = params;
  const orderedCandidates: number[] = [];
  const pushCandidate = (value?: number) => {
    if (!Number.isFinite(value)) return;
    orderedCandidates.push(value as number);
  };

  itemMappedLocalIds.forEach((value) => pushCandidate(value));
  proxyLocalIds.forEach((value) => pushCandidate(value));
  pushCandidate(hitLocalId);
  pushCandidate(localId);

  const resolvedExpressIds = new Set<number>();
  // expressId는 localId가 아니므로 direct candidate로 넣지 않는다.
  // runtime에서 검증된 localId -> expressId 매핑에 한해 alias 확장을 허용한다.
  if (Number.isFinite(expressId)) resolvedExpressIds.add(expressId as number);
  orderedCandidates.forEach((candidate) => {
    const mappedExpressId = canonicalMap.expressIdByLocalId.get(candidate);
    if (Number.isFinite(mappedExpressId))
      resolvedExpressIds.add(mappedExpressId as number);
  });

  resolvedExpressIds.forEach((id) => {
    const aliasLocalIds = canonicalMap.localIdsByExpressId.get(id);
    if (!aliasLocalIds) return;
    aliasLocalIds.forEach((localIdValue) => pushCandidate(localIdValue));
  });

  return Array.from(new Set<number>(orderedCandidates));
};

/** IFC 이동 상태 전이 reducer */
export const nextIfcMoveLifecycleState = (
  current: IfcMoveLifecycleState,
  event: IfcMoveTransitionEvent,
): IfcMoveLifecycleState => {
  if (event.type === "start_drag") {
    return {
      phase: "dragging",
      targetKey: event.targetKey,
      lastError: null,
    };
  }
  if (event.type === "commit_start") {
    if (current.targetKey !== event.targetKey) return current;
    return {
      ...current,
      phase: "commit",
      lastError: null,
    };
  }
  if (event.type === "commit_success") {
    if (current.targetKey !== event.targetKey) return current;
    return {
      ...current,
      phase: "cleanup",
      lastError: null,
    };
  }
  if (event.type === "commit_failure") {
    if (current.targetKey !== event.targetKey) return current;
    return {
      ...current,
      phase: "cleanup",
      lastError: event.message,
    };
  }
  return {
    phase: "idle",
    targetKey: null,
    lastError: current.lastError,
  };
};

/** 이동 대상 키를 생성한다. */
export const getIfcMoveTargetKey = (modelId: string, localId: number) =>
  `${modelId}:${localId}`;

/** Matrix4 delta가 사실상 항등행렬인지 판별한다. */
export const hasIdentityMatrixDelta = (
  matrixElements: number[],
  epsilon = 1e-7,
) =>
  matrixElements.every((value, index) => {
    const expected = index % 5 === 0 ? 1 : 0;
    return Math.abs(value - expected) < epsilon;
  });

// ─────────────────────────────────────────────────────────────────────────────
// IFC 모델 로드 유틸
// ─────────────────────────────────────────────────────────────────────────────

/** projectId가 없을 때 사용하는 fallback 모델 ID */
export const FALLBACK_IFC_MODEL_ID = "mock-shinchan-house";
/** IFC 좌표 단위를 mm(1:1)로 판별할 최소 모델 길이 임계값 */
const IFC_MM_UNIT_SIZE_THRESHOLD = 500;

/**
 * 프로젝트 ID에서 씬 내 모델 ID를 생성한다.
 * 같은 IFC가 여러 프로젝트에 사용될 때 ID 충돌을 방지한다.
 */
export const getRuntimeIfcModelId = (projectId?: string | null) =>
  projectId ? `project-${projectId}` : FALLBACK_IFC_MODEL_ID;

/** IFC 파일을 URL에서 텍스트로 가져온다. 실패 시 에러를 throw한다. */
export const fetchIfcText = async (ifcUrl: string) => {
  const baseUrl = (import.meta.env.BASE_URL ?? "/").replace(/\/+$/, "/");
  const normalizedIfcUrl = ifcUrl.trim();
  const isAbsoluteUrl = /^https?:\/\//i.test(normalizedIfcUrl);
  const candidates = Array.from(
    new Set<string>([
      normalizedIfcUrl,
      isAbsoluteUrl
        ? normalizedIfcUrl
        : normalizedIfcUrl.startsWith("/")
        ? `${baseUrl}${normalizedIfcUrl.replace(/^\/+/, "")}`
        : `${baseUrl}${normalizedIfcUrl}`,
    ]),
  );

  let lastStatus: number | null = null;
  let lastError: unknown = null;

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate);

      if (response.ok) {
        return response.text();
      }

      lastStatus = response.status;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error && lastStatus === null) {
    throw new Error(`IFC file load failed. (${lastError.message})`);
  }

  throw new Error(`IFC file load failed. (${lastStatus ?? "network"})`);
};

// ─────────────────────────────────────────────────────────────────────────────
// 카메라 및 씬 헬퍼
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 모델 크기에 맞게 카메라 near/far 클리핑 평면을 조정한다.
 * far 값이 너무 작으면 큰 모델이 잘리는 문제가 발생한다.
 */
export const setCameraClipping = (
  camera:
    | import("three").PerspectiveCamera
    | import("three").OrthographicCamera,
  maxSize: number,
) => {
  const clippingCamera = camera as typeof camera & {
    near?: number;
    far?: number;
    updateProjectionMatrix?: () => void;
  };
  clippingCamera.near = 1;
  clippingCamera.far = Math.max(maxSize * 12, 100000);
  clippingCamera.updateProjectionMatrix?.();
};

/**
 * 오브젝트 바운딩박스를 기준으로 카메라를 적절한 거리에 배치한다.
 * - padding이 클수록 오브젝트가 화면에 더 작게 들어온다.
 * - camera-controls가 있으면 setLookAt으로 부드럽게 이동하고, 없으면 직접 설정한다.
 */
export const fitObjectWithPadding = (
  THREE: ThreeModule,
  camera:
    | import("three").PerspectiveCamera
    | import("three").OrthographicCamera,
  controls:
    | {
        setLookAt?: (
          positionX: number,
          positionY: number,
          positionZ: number,
          targetX: number,
          targetY: number,
          targetZ: number,
          enableTransition?: boolean,
        ) => Promise<void> | void;
      }
    | undefined,
  object: Object3D,
  padding = 1.8,
) => {
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxSize = Math.max(size.x, size.y, size.z, 1);
  setCameraClipping(camera, maxSize);
  const distance = maxSize * padding;
  const nextX = center.x + distance;
  const nextY = center.y + distance * 0.7;
  const nextZ = center.z + distance;

  if (controls?.setLookAt) {
    void controls.setLookAt(
      nextX,
      nextY,
      nextZ,
      center.x,
      center.y,
      center.z,
      true,
    );
    return;
  }

  const fallbackCamera = camera as typeof camera & {
    lookAt?: (target: import("three").Vector3) => void;
    updateProjectionMatrix?: () => void;
  };
  fallbackCamera.position.set(nextX, nextY, nextZ);
  fallbackCamera.lookAt?.(center);
  fallbackCamera.updateProjectionMatrix?.();
};

// ─────────────────────────────────────────────────────────────────────────────
// 오브젝트 헬퍼
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 클릭된 오브젝트에서 ifcEditTarget userData를 가진 루트를 찾는다.
 * TransformControls가 붙어 있는 편집 프록시 오브젝트를 반환한다.
 */
export const findIfcEditableRoot = (
  object: Object3D,
  editGroup: import("three").Group,
): IfcEditableObject3D | null => {
  let cursor: IfcEditableObject3D | null = object as IfcEditableObject3D;
  while (cursor) {
    if (cursor.userData?.ifcEditTarget) return cursor;
    if (cursor.parent === editGroup) return cursor;
    cursor = (cursor.parent ?? null) as IfcEditableObject3D | null;
  }
  return null;
};

/** 오브젝트의 geometry 및 material을 GPU 메모리에서 해제한다 (메모리 누수 방지). */
export const disposeObjectMaterials = (
  THREE: ThreeModule,
  object: Object3D,
) => {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const disposableGeometry = child.geometry as { dispose?: () => void } | undefined
    disposableGeometry?.dispose?.()
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => {
        ;(material as { dispose?: () => void } | undefined)?.dispose?.()
      })
    } else {
      ;(child.material as { dispose?: () => void } | undefined)?.dispose?.()
    }
  });
};

/** 오브젝트의 모든 메시에 일괄 투명도를 적용한다. */
export const setObjectOpacity = (
  THREE: ThreeModule,
  object: Object3D | undefined,
  opacity: number,
) => {
  if (!object) return;
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    materials.forEach((material) => {
      (material as { transparent?: boolean }).transparent = opacity < 1;
      (material as { opacity?: number }).opacity = opacity;
      (material as { depthWrite?: boolean }).depthWrite = true;
      (material as { needsUpdate?: boolean }).needsUpdate = true;
    });
  });
};

const resolveFragmentsModel = (
  sceneState: ThatOpenSceneState,
  modelId: string,
) => {
  const modelList = sceneState.fragments.core.models.list as Map<
    string,
    unknown
  >;
  const directModel = modelList.get(modelId);
  const fallbackModel = directModel ?? Array.from(modelList.values())[0];
  return fallbackModel as
    | {
        setVisible?: (
          localIds: number[] | undefined,
          visible: boolean,
        ) => Promise<void> | void;
        setOpacity?: (
          localIds: number[] | undefined,
          opacity: number,
        ) => Promise<void> | void;
        resetOpacity?: (localIds: number[] | undefined) => Promise<void> | void;
      }
    | undefined;
};

const syncModelMaskOpacity = async (
  sceneState: ThatOpenSceneState,
  modelId: string,
  localIds: number[],
  mode: "hide" | "restore",
) => {
  const startedAt = performance.now();
  const ids = Array.from(new Set(localIds.filter(Number.isFinite)));
  if (ids.length === 0) return;
  const model = resolveFragmentsModel(sceneState, modelId);
  const hasSetVisible =
    Boolean(model?.setVisible) && IFC_MOVE_USE_MODEL_VISIBILITY_API;
  const hasSetOpacity =
    Boolean(model?.setOpacity) && IFC_MOVE_USE_MODEL_OPACITY_API;
  const hasResetOpacity =
    Boolean(model?.resetOpacity) && IFC_MOVE_USE_MODEL_OPACITY_API;
  traceIfcMoveVisibility("visibility_model_mask_request", {
    modelId,
    mode,
    localIdCount: ids.length,
    localIdsSample: ids.slice(0, 12),
    hasSetVisible,
    hasSetOpacity,
    hasResetOpacity,
  });
  if (mode === "hide") {
    if (IFC_MOVE_USE_MODEL_VISIBILITY_API && model?.setVisible) {
      await Promise.resolve(model.setVisible(ids, false)).catch(
        () => undefined,
      );
      traceIfcMoveVisibility("visibility_model_mask_result", {
        modelId,
        mode,
        method: "setVisible(false)",
        elapsedMs: Number((performance.now() - startedAt).toFixed(1)),
      });
      return;
    }
    if (IFC_MOVE_USE_MODEL_OPACITY_API && model?.setOpacity) {
      await Promise.resolve(model.setOpacity(ids, 0)).catch(() => undefined);
      traceIfcMoveVisibility("visibility_model_mask_result", {
        modelId,
        mode,
        method: "setOpacity",
        elapsedMs: Number((performance.now() - startedAt).toFixed(1)),
      });
      return;
    }
    await sceneState.fragments
      .highlight(
        {
          color: new sceneState.three.Color("#FFFFFF"),
          opacity: 0,
          transparent: true,
          renderedFaces: 1,
          preserveOriginalMaterial: true,
          depthWrite: false,
        },
        {
          [modelId]: new Set(ids),
        },
      )
      .catch(() => undefined);
    traceIfcMoveVisibility("visibility_model_mask_result", {
      modelId,
      mode,
      method: "highlight",
      elapsedMs: Number((performance.now() - startedAt).toFixed(1)),
    });
    return;
  }
  if (IFC_MOVE_USE_MODEL_VISIBILITY_API && model?.setVisible) {
    await Promise.resolve(model.setVisible(ids, true)).catch(() => undefined);
    traceIfcMoveVisibility("visibility_model_mask_result", {
      modelId,
      mode,
      method: "setVisible(true)",
      elapsedMs: Number((performance.now() - startedAt).toFixed(1)),
    });
    return;
  }
  if (IFC_MOVE_USE_MODEL_OPACITY_API && model?.resetOpacity) {
    await Promise.resolve(model.resetOpacity(ids)).catch(() => undefined);
    traceIfcMoveVisibility("visibility_model_mask_result", {
      modelId,
      mode,
      method: "resetOpacity",
      elapsedMs: Number((performance.now() - startedAt).toFixed(1)),
    });
    return;
  }
  await sceneState.fragments
    .resetHighlight({
      [modelId]: new Set(ids),
    })
    .catch(() => undefined);
  traceIfcMoveVisibility("visibility_model_mask_result", {
    modelId,
    mode,
    method: "resetHighlight",
    elapsedMs: Number((performance.now() - startedAt).toFixed(1)),
  });
};

/**
 * IFC 선택 프록시 표시 상태를 일관되게 갱신한다.
 * - mode='proxy': 원본 숨김 + 편집 프록시 표시
 * - mode='model': 원본 표시 + 프록시 불투명 복구
 */
const cloneMaterialForEditProxy = (material: unknown) => {
  const cloneable = material as {
    clone?: () => unknown;
    map?: { clone?: () => unknown; needsUpdate?: boolean };
  };
  const cloned = cloneable?.clone?.() ?? material;
  const clonedWithMap = cloned as { map?: unknown; needsUpdate?: boolean };
  const clonedMap = cloneable?.map?.clone?.();
  if (clonedMap) {
    (clonedMap as { needsUpdate?: boolean }).needsUpdate = true;
    clonedWithMap.map = clonedMap;
  }
  clonedWithMap.needsUpdate = true;
  return cloned;
};

const cloneObjectMaterialsForEditProxy = (
  THREE: ThreeModule,
  object: Object3D,
) => {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.material = Array.isArray(child.material)
      ? (child.material.map((material) =>
          cloneMaterialForEditProxy(material),
        ) as typeof child.material)
      : (cloneMaterialForEditProxy(child.material) as typeof child.material);
  });
};

export const applyIfcSelectionVisibility = async (
  sceneState: ThatOpenSceneState,
  params: {
    modelId: string;
    localIds: number[];
    proxyObject?: Object3D;
    mode: "proxy" | "model";
    proxyOpacity?: number;
    keepModelVisibleInProxy?: boolean;
    persistModelHidden?: boolean;
    skipHiderUpdate?: boolean;
    skipCoreUpdate?: boolean;
    deferHiderToNextFrame?: boolean;
    skipProxyOpacityUpdate?: boolean;
    reason?: string;
    forceRender?: boolean;
  },
) => {
  const syncFragmentsAfterVisibility = async () => {
    const fragmentsCore = sceneState.fragments.core as {
      update?: (force?: boolean) => Promise<void> | void;
    };
    if (typeof fragmentsCore.update !== "function") return;
    traceIfcMoveVisibility("visibility_core_update_start", {
      reason: params.reason ?? "unspecified",
      mode: params.mode,
      modelId: params.modelId,
    });
    await Promise.resolve(fragmentsCore.update(true)).catch(() => undefined);
    traceIfcMoveVisibility("visibility_core_update_done", {
      reason: params.reason ?? "unspecified",
      mode: params.mode,
      modelId: params.modelId,
    });
  };

  const visibleLocalIds = params.localIds.filter(Number.isFinite);
  const visibilityReason = params.reason ?? "unspecified";
  traceIfcMoveVisibility("visibility_call", {
    reason: visibilityReason,
    mode: params.mode,
    modelId: params.modelId,
    localIdCount: visibleLocalIds.length,
    localIdsSample: visibleLocalIds.slice(0, 12),
    hasProxyObject: Boolean(params.proxyObject),
    keepModelVisibleInProxy: params.keepModelVisibleInProxy ?? false,
    persistModelHidden: params.persistModelHidden ?? false,
    skipHiderUpdate: params.skipHiderUpdate ?? false,
    skipCoreUpdate: params.skipCoreUpdate ?? false,
    deferHiderToNextFrame: params.deferHiderToNextFrame ?? false,
    skipProxyOpacityUpdate: params.skipProxyOpacityUpdate ?? false,
  });
  if (visibleLocalIds.length > 0) {
    const visibilityStartedAt = performance.now();
    const hiderVisible =
      params.mode === "model" ||
      (params.mode === "proxy" && params.keepModelVisibleInProxy === true);
    const skipHiderCall = params.skipHiderUpdate === true;
    if (
      params.persistModelHidden === true ||
      params.keepModelVisibleInProxy === true ||
      params.mode === "model"
    ) {
      await syncModelMaskOpacity(
        sceneState,
        params.modelId,
        visibleLocalIds,
        params.mode === "proxy" ? "hide" : "restore",
      );
      traceIfcMoveVisibility("visibility_model_mask_sync", {
        reason: visibilityReason,
        mode: params.mode,
        modelId: params.modelId,
        localIdCount: visibleLocalIds.length,
        localIdsSample: visibleLocalIds.slice(0, 12),
        persistModelHidden: params.persistModelHidden ?? false,
      });
    }
    if (
      params.mode === "proxy" &&
      !skipHiderCall &&
      visibleLocalIds.length > 12 &&
      typeof console !== "undefined"
    ) {
      console.warn("[IFC_MOVE] visibility_scope_large", {
        reason: visibilityReason,
        modelId: params.modelId,
        localIdCount: visibleLocalIds.length,
        localIdsSample: visibleLocalIds.slice(0, 8),
      });
    }
    if (IFC_MOVE_DEBUG) {
      console.log("[IFC_MOVE] visibility_apply", {
        reason: visibilityReason,
        modelId: params.modelId,
        localIds: visibleLocalIds,
        mode: params.mode,
        hiderVisible,
        keepModelVisibleInProxy: params.keepModelVisibleInProxy ?? false,
        persistModelHidden: params.persistModelHidden ?? false,
        skipHiderUpdate: params.skipHiderUpdate ?? false,
        skipCoreUpdate: params.skipCoreUpdate ?? false,
        skipHiderCall,
      });
    }
    if (!skipHiderCall) {
      if (params.deferHiderToNextFrame && typeof window !== "undefined") {
        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => resolve());
        });
      }
      traceIfcMoveVisibility("visibility_hider_set_start", {
        reason: visibilityReason,
        mode: params.mode,
        modelId: params.modelId,
        localIdCount: visibleLocalIds.length,
      });
      await sceneState.hider
        .set(hiderVisible, {
          [params.modelId]: new Set(visibleLocalIds),
        })
        .catch(() => undefined);
      traceIfcMoveVisibility("visibility_hider_set_done", {
        reason: visibilityReason,
        mode: params.mode,
        modelId: params.modelId,
        localIdCount: visibleLocalIds.length,
        elapsedMs: Number((performance.now() - visibilityStartedAt).toFixed(1)),
      });
    }
    if (IFC_MOVE_DEBUG) {
      console.log("[IFC_MOVE] visibility_applied", {
        reason: visibilityReason,
        modelId: params.modelId,
        localIds: visibleLocalIds,
        mode: params.mode,
        hiderVisible,
        keepModelVisibleInProxy: params.keepModelVisibleInProxy ?? false,
        persistModelHidden: params.persistModelHidden ?? false,
        skipHiderUpdate: params.skipHiderUpdate ?? false,
        skipCoreUpdate: params.skipCoreUpdate ?? false,
        skipHiderCall,
        elapsedMs: Number((performance.now() - visibilityStartedAt).toFixed(1)),
      });
    }
    if (params.skipCoreUpdate === true) {
      traceIfcMoveVisibility("visibility_core_update_skipped", {
        reason: visibilityReason,
        mode: params.mode,
        modelId: params.modelId,
      });
    } else {
      await syncFragmentsAfterVisibility();
    }
  }
  if (!params.proxyObject) return;
  if (params.mode === "proxy") {
    if (params.skipProxyOpacityUpdate === true) return;
    if (IFC_MOVE_DEBUG) {
      console.log("[IFC_MOVE] proxy_opacity_apply", {
        reason: visibilityReason,
        modelId: params.modelId,
        localIds: visibleLocalIds,
        opacity: params.proxyOpacity ?? 1,
      });
    }
    setObjectOpacity(
      sceneState.three,
      params.proxyObject,
      params.proxyOpacity ?? 1,
    );
    traceIfcMoveVisibility("visibility_proxy_opacity", {
      reason: visibilityReason,
      mode: params.mode,
      modelId: params.modelId,
      opacity: params.proxyOpacity ?? 1,
    });
    if (params.forceRender) {
      sceneState.renderer.render(
        sceneState.scene,
        sceneState.camera as import("three").PerspectiveCamera,
      );
      traceIfcMoveVisibility("visibility_force_render", {
        reason: visibilityReason,
        mode: params.mode,
        modelId: params.modelId,
      });
    }
    return;
  }
  if (IFC_MOVE_DEBUG) {
    console.log("[IFC_MOVE] proxy_opacity_apply", {
      reason: visibilityReason,
      modelId: params.modelId,
      localIds: visibleLocalIds,
      opacity: 1,
    });
  }
  setObjectOpacity(sceneState.three, params.proxyObject, 1);
  traceIfcMoveVisibility("visibility_proxy_opacity", {
    reason: visibilityReason,
    mode: params.mode,
    modelId: params.modelId,
    opacity: 1,
  });
  if (params.forceRender) {
    sceneState.renderer.render(
      sceneState.scene,
      sceneState.camera as import("three").PerspectiveCamera,
    );
    traceIfcMoveVisibility("visibility_force_render", {
      reason: visibilityReason,
      mode: params.mode,
      modelId: params.modelId,
    });
  }
};

/**
 * TransformControls를 분리하고 선택 상태를 초기화한다.
 * removeObject=true이면 씬에서 오브젝트도 제거하고 GPU 메모리를 해제한다.
 */
export const clearSelectedTarget = async (
  sceneState: ThatOpenSceneState,
  target: Selected3DTarget,
  removeObject = false,
  restoreModelVisibility?: boolean,
  skipVisibilitySync = false,
) => {
  if (!target) return;

  logEditor3dUndoDebug("thatopen-clear-selected-target", "start", {
    removeObject,
    restoreModelVisibility: restoreModelVisibility ?? null,
    skipVisibilitySync,
    target: summarizeClearSelectedTargetFor3dUndo(target),
  });

  try {
  sceneState.transformControls.detach();
  sceneState.transformControls.visible = false;
  sceneState.transformControls.enabled = false;

  if (target.source === "ifc") {
    if (skipVisibilitySync) {
      if (removeObject && target.object) {
        target.object.parent?.remove(target.object);
        disposeObjectMaterials(sceneState.three, target.object);
      }
      return;
    }
    if (!target.object) {
      // 프록시가 이미 정리된 보존 타겟이라도, 원본 표시 모드여야 한다면
      // 최소 식별자(hot/hit localId) 기준으로 가시성을 복구한다.
      // 이 복구가 없으면 선택 전환 시 숨김 상태가 누적되어 "요소가 사라짐"처럼 보일 수 있다.
      const shouldRestoreModelVisibility =
        restoreModelVisibility ?? !target.keepModelHiddenAfterCommit;
      if (shouldRestoreModelVisibility && target.visibilityRestoredAtCommit) {
        if (IFC_MOVE_DEBUG) {
          console.log(
            "[IFC_MOVE] clear_preserved_target_skip_restore_visibility",
            {
              modelId: target.modelId,
              hitLocalId: target.hitLocalId,
              localId: target.localId,
            },
          );
        }
        return;
      }
      if (shouldRestoreModelVisibility) {
        const visibleLocalIds = Array.from(
          new Set<number>(
            [target.hitLocalId, target.localId].filter(Number.isFinite),
          ),
        );
        if (IFC_MOVE_DEBUG) {
          console.log("[IFC_MOVE] clear_preserved_target_restore_visibility", {
            modelId: target.modelId,
            localIds: visibleLocalIds,
            keepModelHiddenAfterCommit: Boolean(
              target.keepModelHiddenAfterCommit,
            ),
          });
        }
        if (visibleLocalIds.length > 0) {
          await applyIfcSelectionVisibility(sceneState, {
            modelId: target.modelId,
            localIds: visibleLocalIds,
            mode: "model",
            keepModelVisibleInProxy: true,
            reason: "clear_preserved_target_restore",
          });
        }
      }
      return;
    }
    const proxyLocalIds = (
      (target.object as IfcEditableObject3D | undefined)?.userData
        ?.ifcEditTarget?.localIds ?? []
    ).filter(Number.isFinite);
    const visibleLocalIds = Array.from(
      new Set<number>(
        [...proxyLocalIds, target.hitLocalId, target.localId].filter(
          Number.isFinite,
        ),
      ),
    );
    const shouldRestoreModelVisibility =
      restoreModelVisibility ?? !target.keepModelHiddenAfterCommit;
    if (shouldRestoreModelVisibility && target.visibilityRestoredAtCommit) {
      if (IFC_MOVE_DEBUG) {
        console.log("[IFC_MOVE] clear_target_skip_restore_visibility", {
          modelId: target.modelId,
          hitLocalId: target.hitLocalId,
          localId: target.localId,
        });
      }
      if (removeObject && target.object) {
        target.object.parent?.remove(target.object);
        disposeObjectMaterials(sceneState.three, target.object);
      }
      return;
    }
    if (!shouldRestoreModelVisibility) {
      if (target.object) {
        target.object.visible = true;
        setObjectOpacity(sceneState.three, target.object, 1);
        if (removeObject) {
          if (target.keepModelHiddenAfterCommit) {
            traceIfcMoveVisibility("clear_target_keep_proxy_visible", {
              modelId: target.modelId,
              hitLocalId: target.hitLocalId,
              localId: target.localId,
              reason: "model_hidden_after_commit",
            });
            if (sceneState.renderer && sceneState.camera) {
              sceneState.renderer.render(
                sceneState.scene,
                sceneState.camera as import("three").PerspectiveCamera,
              );
            }
            return;
          }
          target.object.parent?.remove(target.object);
          disposeObjectMaterials(sceneState.three, target.object);
        }
      }
      return;
    }
    await applyIfcSelectionVisibility(sceneState, {
      modelId: target.modelId,
      localIds: visibleLocalIds,
      proxyObject: target.object,
      mode: shouldRestoreModelVisibility ? "model" : "proxy",
      keepModelVisibleInProxy: true,
      reason: "clear_selected_target",
    });
    if (target.object) {
      if (removeObject) {
        target.object.parent?.remove(target.object);
        disposeObjectMaterials(sceneState.three, target.object);
      }
    }
    return;
  }

  if (removeObject) {
    target.object.parent?.remove(target.object);
    disposeObjectMaterials(sceneState.three, target.object);
  }
  } finally {
    logEditor3dUndoDebug("thatopen-clear-selected-target", "done", {
      removeObject,
      restoreModelVisibility: restoreModelVisibility ?? null,
      skipVisibilitySync,
      target: summarizeClearSelectedTargetFor3dUndo(target),
    });
  }
};

/**
 * 라이브러리 프리셋 그룹을 IFC 모델 옆에 배치한다.
 * IFC 모델의 바운딩박스 우측 끝에서 600mm 간격을 두고 놓는다.
 */
export const positionPresetGroupBesideIfc = (
  THREE: ThreeModule,
  ifcObject: Object3D,
  presetGroup: import("three").Group,
  worldUnitsPerMm = PROJECT_WORLD_UNITS_PER_MM,
) => {
  if (presetGroup.children.length === 0) return;

  const ifcBox = new THREE.Box3().setFromObject(ifcObject);
  const ifcCenter = new THREE.Vector3();
  const ifcSize = new THREE.Vector3();
  ifcBox.getCenter(ifcCenter);
  ifcBox.getSize(ifcSize);
  const ifcGroundY = ifcCenter.y - ifcSize.y / 2;

  const previousPosition = new THREE.Vector3(
    presetGroup.position.x,
    presetGroup.position.y,
    presetGroup.position.z,
  );
  presetGroup.position.set(0, 0, 0);
  (
    presetGroup as Object3D & { updateMatrixWorld?: (force?: boolean) => void }
  ).updateMatrixWorld?.(true);

  const presetBox = new THREE.Box3().setFromObject(presetGroup);
  const presetCenter = new THREE.Vector3();
  const presetSize = new THREE.Vector3();
  presetBox.getCenter(presetCenter);
  presetBox.getSize(presetSize);
  const presetGroundY = presetCenter.y - presetSize.y / 2;

  const gap = 600;
  presetGroup.position.copy(previousPosition);
  presetGroup.position.set(
    ifcCenter.x +
      ifcSize.x / 2 +
      gap * worldUnitsPerMm -
      (presetCenter.x - presetSize.x / 2),
    ifcGroundY - presetGroundY,
    ifcCenter.z - presetCenter.z,
  );
  (
    presetGroup as Object3D & { updateMatrixWorld?: (force?: boolean) => void }
  ).updateMatrixWorld?.(true);
};

/**
 * 저장 위치가 없는 라이브러리 프리셋은 항상 기준 모델의 바깥쪽에 보이도록 보정한다.
 * 드롭/클릭 추가 시 모델 내부 히트 지점에 묻히는 것을 막기 위한 마지막 배치 가드다.
 */
export const ensureLibraryPresetOutsideIfc = (
  THREE: ThreeModule,
  ifcObject: Object3D,
  presetObject: Object3D,
  worldUnitsPerMm = PROJECT_WORLD_UNITS_PER_MM,
) => {
  const ifcBox = new THREE.Box3().setFromObject(ifcObject);
  if (ifcBox.isEmpty()) return;

  presetObject.updateMatrixWorld(true);
  const presetBox = new THREE.Box3().setFromObject(presetObject);
  if (presetBox.isEmpty()) return;

  const gap = 600 * worldUnitsPerMm;
  const targetMinX = ifcBox.max.x + gap;
  const deltaX = presetBox.min.x < targetMinX ? targetMinX - presetBox.min.x : 0;
  const deltaY = ifcBox.min.y - presetBox.min.y;

  if (Math.abs(deltaX) < 1e-8 && Math.abs(deltaY) < 1e-8) return;

  const nextWorldPosition = new THREE.Vector3();
  presetObject.getWorldPosition(nextWorldPosition);
  nextWorldPosition.x += deltaX;
  nextWorldPosition.y += deltaY;

  if (presetObject.parent) {
    presetObject.position.copy(presetObject.parent.worldToLocal(nextWorldPosition));
  } else {
    presetObject.position.copy(nextWorldPosition);
  }
  presetObject.updateMatrixWorld(true);
};

// ─────────────────────────────────────────────────────────────────────────────
// 치수·좌표·재질 유틸
// ─────────────────────────────────────────────────────────────────────────────

/**
 * IFC 모델 크기를 보고 월드 단위/mm 비율을 추정한다.
 * - 모델 최대 길이가 충분히 크면(mm 기반 좌표) 1:1로 간주한다.
 * - 그렇지 않으면 프로젝트 기본값(미터 기반 좌표 추정)을 사용한다.
 *
 * 기존 100 임계값은 meter 기반 대형 모델(예: 120m)을 mm로 오인해
 * 이동 스냅 간격이 과도하게 커지는 문제가 있어 보수적으로 상향한다.
 */
export const inferWorldUnitsPerMm = (
  THREE: ThreeModule,
  ifcObject: Object3D,
) => {
  const ifcSize = new THREE.Vector3();
  new THREE.Box3().setFromObject(ifcObject).getSize(ifcSize);
  const maxSize = Math.max(ifcSize.x, ifcSize.y, ifcSize.z);

  return maxSize > IFC_MM_UNIT_SIZE_THRESHOLD ? 1 : PROJECT_WORLD_UNITS_PER_MM;
};

/** Three.js 재질 객체에서 HEX 색상 문자열을 추출한다. */
export const getMaterialColorHex = (material: unknown) => {
  const color = (material as { color?: { getHexString?: () => string } })
    ?.color;
  const hex = color?.getHexString?.();
  return hex ? `#${hex.toUpperCase()}` : undefined;
};

/**
 * 오브젝트 바운딩박스에서 길이·높이·두께를 mm 단위로 반환한다.
 * 유효하지 않은 크기이면 null을 반환한다.
 */
export const getObjectSizeMm = (
  THREE: ThreeModule,
  object: Object3D | undefined,
  worldUnitsPerMm: number,
) => {
  if (!object) return null;
  if (!Number.isFinite(worldUnitsPerMm) || worldUnitsPerMm <= 0) return null;
  const size = new THREE.Vector3();
  // 회전된 오브젝트의 월드 AABB는 치수가 과대해질 수 있으므로,
  // 측정 전 루트 회전을 제거한 복제본에서 스케일 기반 크기를 계산한다.
  const measurementRoot = object.clone(true);
  measurementRoot.position.set(0, 0, 0);
  measurementRoot.rotation.set(0, 0, 0);
  measurementRoot.quaternion.identity();
  measurementRoot.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(measurementRoot);
  if (box.isEmpty()) return null;
  box.getSize(size);
  if (
    !Number.isFinite(size.x) ||
    !Number.isFinite(size.y) ||
    !Number.isFinite(size.z)
  )
    return null;
  if (size.x <= 0 || size.y <= 0 || size.z <= 0) return null;

  return {
    lengthMm: Math.round(size.x / worldUnitsPerMm),
    heightMm: Math.round(size.y / worldUnitsPerMm),
    thicknessMm: Math.round(size.z / worldUnitsPerMm),
  };
};

/**
 * IFC 모델의 기존 색상(HEX)으로부터 에디터 재질 이름을 역추론한다.
 * DEFAULT_IFC_COLOR_BY_CATEGORY와 대응되는 색상만 인식하며,
 * 그 외 색상은 undefined를 반환해 재질 스타일 덮어쓰기를 생략한다.
 */
export const resolveEditorMaterialFromColor = (color?: string) => {
  if (!color) return undefined;
  const normalized = color.toUpperCase();
  if (normalized === "#C56F45") return "Tile";
  if (normalized === "#A8A29E") return "Concrete";
  if (normalized === "#A3472C") return "Brick";
  if (normalized === "#8A94A3") return "Steel";
  if (normalized === "#9A6232") return "Wood";
  if (normalized === "#8FD3FF") return "Glass";
  if (normalized === "#8D8D86") return "Stone";
  return undefined;
};

/** 좌표값을 소수점 1자리로 반올림한다. */
export const roundCoordinate = (value: number) => Math.round(value * 10) / 10;

/** Three.js 위치 객체를 디스플레이용 좌표로 변환한다. */
export const toDisplayCoordinates = (position: {
  x: number;
  y: number;
  z: number;
}) => ({
  x: roundCoordinate(position.x),
  y: roundCoordinate(position.y),
  z: roundCoordinate(position.z),
});

// ─────────────────────────────────────────────────────────────────────────────
// 재질 스타일 헬퍼
// ─────────────────────────────────────────────────────────────────────────────

/**
 * IFC 모델 최초 로드 시 기존 재질 색상으로부터 에디터 재질 스타일을 적용한다.
 * 인식된 색상의 메시에만 createElementMaterial로 교체하고, 그 외는 유지한다.
 */
export const applyInitialIfcMaterialStyles = (
  THREE: ThreeModule,
  ifcObject: Object3D,
  materialsManager?: MaybeThatOpenMaterialsManager,
) => {
  ifcObject.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;

    const previousMaterials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    const color = previousMaterials.map(getMaterialColorHex).find(Boolean);
    const materialName = resolveEditorMaterialFromColor(color);
    if (!materialName) return;

    previousMaterials.forEach((material) => {
      const map = (material as { map?: { dispose?: () => void } }).map;
      map?.dispose?.();
      material.dispose();
    });
    child.material = createElementMaterial(
      THREE,
      materialName,
      color,
      materialsManager,
    );
  });
};

/**
 * fragments.highlight를 이용해 IFC 요소에 색상을 적용한다.
 * preserveOriginalMaterial: true로 원본 재질을 보존하고 색상 레이어만 덮어씌운다.
 */
export const applyIfcItemColor = async (
  THREE: ThreeModule,
  fragments: import("@thatopen/components").FragmentsManager,
  target: Extract<Selected3DTarget, { source: "ifc" }>,
  color?: string,
) => {
  if (!color) return;

  await fragments.highlight(
    {
      color: new THREE.Color(color),
      opacity: 1,
      transparent: false,
      renderedFaces: 1,
      preserveOriginalMaterial: true,
    },
    {
      [target.modelId]: new Set([target.hitLocalId]),
    },
  );
};

/**
 * IFC 요소의 실제 fragment mesh를 복제한 편집 프록시 오브젝트를 생성하고
 * TransformControls를 연결한다.
 * - 원본 IFC는 선택 중 숨기고, 프록시를 이동 대상으로 사용한다.
 * - 선택 해제 시 clearSelectedTarget에서 프록시를 정리한다.
 * - 이미 같은 ID의 프록시가 있으면 재사용한다.
 */
export const attachIfcTransformProxy = async (
  THREE: ThreeModule,
  fragments: import("@thatopen/components").FragmentsManager,
  hider: import("@thatopen/components").Hider,
  transformControls: import("three/examples/jsm/controls/TransformControls.js").TransformControls,
  editGroup: import("three").Group,
  modelId: string,
  localIds: number[],
  visibleLocalId: number,
  hitItemId: number | undefined,
  element: IfcElementInfo,
  options: {
    deferVisibility?: boolean
    deferTransformAttach?: boolean
    allowBoundsFallback?: boolean
  } = {},
) => {
  const deferVisibility = options.deferVisibility === true
  const deferTransformAttach = options.deferTransformAttach === true
  const allowBoundsFallback = options.allowBoundsFallback === true
  const orderedLocalIds = Array.from(
    new Set<number>([
      ...(Number.isFinite(visibleLocalId) ? [visibleLocalId] : []),
      ...localIds.filter(Number.isFinite),
    ]),
  );
  if (orderedLocalIds.length === 0) return null;

  const editor = (fragments.core as import('@thatopen/fragments').FragmentsModels & {
    editor?: import('@thatopen/fragments').Editor
  }).editor

  const boxes = await fragments.getBBoxes({
    [modelId]: new Set(orderedLocalIds),
  });
  const unionBox = new THREE.Box3();
  unionBox.makeEmpty();
  boxes.forEach((box) => {
    if (!box) return;
    unionBox.union(box);
  });
  if (unionBox.isEmpty()) return null;

  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  unionBox.getSize(size);
  unionBox.getCenter(center);
  if (size.x <= 0 || size.y <= 0 || size.z <= 0) return null;

  const stableLocalId = Number.isFinite(visibleLocalId) ? visibleLocalId : orderedLocalIds[0]
  const objectName = `ifc-edit-${modelId}-${stableLocalId}`
  const existing = editGroup.children.find((child) => child.name === objectName) as IfcEditableObject3D | undefined
  const editable = existing ?? new THREE.Group()
  const pivotToLocal = new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z)

  if (existing) {
    [...editable.children].forEach((child) => {
      child.parent?.remove(child);
      disposeObjectMaterials(THREE, child);
    });
  }

  const attachBoundsFallback = () => {
    const geometry = new THREE.BoxGeometry(size.x, size.y, size.z)
    const material = createElementMaterial(
      THREE,
      element.material,
      element.color ?? '#9CA3AF',
    )
    const fallbackMesh = new THREE.Mesh(geometry, material)
    fallbackMesh.name = `${objectName}-bounds`
    editable.add(fallbackMesh)
    editable.userData.ifcEditFallbackProxy = true
  }

  const elements = editor
    ? await editor.getElements(modelId, orderedLocalIds).catch(() => [])
    : []
  if (elements.length === 0 && allowBoundsFallback) {
    attachBoundsFallback()
  } else if (elements.length === 0) {
    return null
  } else {
    editable.userData.ifcEditFallbackProxy = false
    for (const editableElement of elements) {
      const meshes = await editableElement.getMeshes().catch(() => null)
      if (!meshes) continue
      const cloned = meshes.clone(true)
      cloneObjectMaterialsForEditProxy(THREE, cloned)
      cloned.applyMatrix4(pivotToLocal)
      editable.add(cloned)
    }
    if (editable.children.length === 0 && allowBoundsFallback) {
      attachBoundsFallback()
    }
  }
  if (editable.children.length === 0) return null

  editable.name = objectName;
  editable.position.copy(center);
  editable.rotation.set(0, 0, 0);
  editable.scale.set(1, 1, 1);
  editable.userData = {
    ...editable.userData,
    ifcEditTarget: {
      modelId,
      localId: stableLocalId,
      hitLocalId: Number.isFinite(visibleLocalId)
        ? visibleLocalId
        : orderedLocalIds[0],
      hitItemId,
      localIds: Array.from(new Set(orderedLocalIds.filter(Number.isFinite))),
      element,
    },
    ifcEditBaseWorldSize: {
      x: size.x || 1,
      y: size.y || 1,
      z: size.z || 1,
    },
  };

  if (!existing) {
    editGroup.add(editable);
  }
  editable.updateMatrixWorld(true);

  const clonedBox = new THREE.Box3().setFromObject(editable);
  const clonedCenter = new THREE.Vector3();
  clonedBox.getCenter(clonedCenter);
  const centerOffset = clonedCenter.sub(center);
  if (centerOffset.lengthSq() > 1e-8) {
    editable.children.forEach((child) => {
      child.position.sub(centerOffset);
    });
    editable.updateMatrixWorld(true);
  }

  const hideLocalIds = Array.from(
    new Set<number>(orderedLocalIds.filter(Number.isFinite)),
  );

  if (IFC_MOVE_DEBUG) {
    console.log("[IFC_MOVE] proxy_attach_hide_model", {
      modelId,
      localIds: orderedLocalIds,
      hideLocalIds,
      localIdCount: orderedLocalIds.length,
      visibleLocalId,
      hitLocalId: stableLocalId,
      hiderVisible: false,
      proxyShape: "ifc-mesh-clone",
    });
  }
  traceIfcMoveVisibility("proxy_attach_hide_model", {
    modelId,
    visibleLocalId,
    hitLocalId: stableLocalId,
    localIdCount: orderedLocalIds.length,
    localIdsSample: orderedLocalIds.slice(0, 12),
    hideLocalIds,
    proxyShape: "ifc-mesh-clone",
  });
  traceIfcMoveVisibility("proxy_attach_hider_set_start", {
    modelId,
    hideLocalIds,
    deferred: deferVisibility,
  });
  if (deferVisibility) {
    editable.visible = false;
    traceIfcMoveVisibility("proxy_attach_visibility_deferred", {
      modelId,
      hideLocalIds,
    });
  } else {
    await hider
      .set(false, {
        [modelId]: new Set(hideLocalIds),
      })
      .catch(() => undefined);
    traceIfcMoveVisibility("proxy_attach_hider_set_done", {
      modelId,
      hideLocalIds,
    });
  }
  setObjectOpacity(THREE, editable, 1);
  if (!deferTransformAttach) {
    editable.visible = true;
    transformControls.attach(editable);
    transformControls.visible = true;
    transformControls.enabled = true;
  }
  return editable;
};
