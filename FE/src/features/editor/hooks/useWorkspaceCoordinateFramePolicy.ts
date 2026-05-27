import { useCallback, useMemo } from 'react'
import type { BubbleData, CanvasViewTransform, WorkspaceSnapshot } from '../types'
import type { LayoutImportBoundaryInput } from '../utils/editorPageHelpers'
import { getRuntimeEnvString } from '@/shared/lib/runtimeEnv'
import { resolveCanvasRotationCenter, resolveCanvasViewTransform } from '../utils/canvasViewTransform'
import {
  mapBubblesCoordinateFrame,
  mapFlatPointsCoordinateFrame,
  mapWorkspaceSnapshotCoordinateFrame,
  type WorkspaceCoordinateFrame,
} from '../utils/workspaceCoordinateFrame'
import { resolveWorkspaceCoordinateFrame } from '../utils/workspaceCoordinateFramePolicy'

const WORKSPACE_CANONICAL_COORDINATE_FRAME_ENV = getRuntimeEnvString(
  'VITE_EDITOR_CANONICAL_COORDINATE_FRAME',
  'project_north',
)
const WORKSPACE_PERSIST_COORDINATE_FRAME_ENV = getRuntimeEnvString(
  'VITE_EDITOR_PERSIST_COORDINATE_FRAME',
  'project_north',
)
const WORKSPACE_GENERATE_COORDINATE_FRAME_ENV = getRuntimeEnvString(
  'VITE_EDITOR_GENERATE_COORDINATE_FRAME',
  'project_north',
)

interface UseWorkspaceCoordinateFramePolicyParams {
  bubbleSitePoints: number[]
  sharedSitePlanPoints: number[]
  userViewRotationRadians: number
}

/**
 * 에디터 좌표 프레임 정책 훅.
 * - 보기 전용 회전(transform)
 * - 저장/동기화용 프레임 매핑
 * - 생성 API 요청 전 프레임 매핑
 */
export function useWorkspaceCoordinateFramePolicy({
  bubbleSitePoints,
  sharedSitePlanPoints,
  userViewRotationRadians,
}: UseWorkspaceCoordinateFramePolicyParams) {
  /**
   * canonical 좌표계를 project north 기준으로 정렬할 때 재사용되는 기준 변환.
   * 저장/생성 경계에서 true_north ↔ project_north 매핑 기준점으로 사용한다.
   */
  const projectNorthViewTransform = useMemo(
    () => resolveCanvasViewTransform(sharedSitePlanPoints),
    [sharedSitePlanPoints],
  )
  const projectNorthViewRotationRadians = projectNorthViewTransform?.rotationRadians ?? 0

  const workspaceCanonicalCoordinateFrame = useMemo(
    () => resolveWorkspaceCoordinateFrame(WORKSPACE_CANONICAL_COORDINATE_FRAME_ENV, 'project_north'),
    [],
  )
  const workspacePersistCoordinateFrame = useMemo(
    () => resolveWorkspaceCoordinateFrame(
      WORKSPACE_PERSIST_COORDINATE_FRAME_ENV,
      workspaceCanonicalCoordinateFrame,
    ),
    [workspaceCanonicalCoordinateFrame],
  )
  const workspaceGenerateCoordinateFrame = useMemo<WorkspaceCoordinateFrame>(
    () => resolveWorkspaceCoordinateFrame(WORKSPACE_GENERATE_COORDINATE_FRAME_ENV, 'project_north'),
    [],
  )

  const mapSnapshotForPersistence = useCallback((snapshot: WorkspaceSnapshot): WorkspaceSnapshot =>
    mapWorkspaceSnapshotCoordinateFrame(snapshot, {
      sourceFrame: workspaceCanonicalCoordinateFrame,
      targetFrame: workspacePersistCoordinateFrame,
      projectNorthViewTransform,
    }),
  [projectNorthViewTransform, workspaceCanonicalCoordinateFrame, workspacePersistCoordinateFrame])

  const mapBubblesForFloorPlanGenerate = useCallback(
    (sourceBubbles: BubbleData[]): BubbleData[] =>
      mapBubblesCoordinateFrame(sourceBubbles, {
        sourceFrame: workspaceCanonicalCoordinateFrame,
        targetFrame: workspaceGenerateCoordinateFrame,
        projectNorthViewTransform,
      }),
    [projectNorthViewTransform, workspaceCanonicalCoordinateFrame, workspaceGenerateCoordinateFrame],
  )

  const mapLayoutBoundaryInputForFloorPlanGenerate = useCallback(
    (boundaryInput: LayoutImportBoundaryInput): LayoutImportBoundaryInput => {
      if (boundaryInput.source !== 'site') return boundaryInput
      return {
        source: 'site',
        sitePlanPoints: mapFlatPointsCoordinateFrame(boundaryInput.sitePlanPoints, {
          sourceFrame: workspaceCanonicalCoordinateFrame,
          targetFrame: workspaceGenerateCoordinateFrame,
          projectNorthViewTransform,
        }),
      }
    },
    [projectNorthViewTransform, workspaceCanonicalCoordinateFrame, workspaceGenerateCoordinateFrame],
  )

  /**
   * 보기 전용 회전 변환.
   * - canonical 편집 데이터는 건드리지 않고 렌더 계층에서만 적용한다.
   */
  const bubbleCanvasViewTransform = useMemo<CanvasViewTransform | null>(() => {
    if (userViewRotationRadians === 0) return null
    const center = resolveCanvasRotationCenter(bubbleSitePoints)
    if (!center) return null
    return { rotationRadians: userViewRotationRadians, ...center }
  }, [bubbleSitePoints, userViewRotationRadians])
  const floorCanvasViewTransform = useMemo<CanvasViewTransform | null>(() => {
    if (userViewRotationRadians === 0) return null
    const center = resolveCanvasRotationCenter(sharedSitePlanPoints)
    if (!center) return null
    return { rotationRadians: userViewRotationRadians, ...center }
  }, [sharedSitePlanPoints, userViewRotationRadians])

  return {
    bubbleCanvasViewTransform,
    floorCanvasViewTransform,
    projectNorthViewRotationRadians,
    mapSnapshotForPersistence,
    mapBubblesForFloorPlanGenerate,
    mapLayoutBoundaryInputForFloorPlanGenerate,
  }
}
