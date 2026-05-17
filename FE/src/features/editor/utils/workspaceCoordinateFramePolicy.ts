import type { WorkspaceCoordinateFrame } from './workspaceCoordinateFrame'

/**
 * 좌표 프레임 문자열을 안전하게 파싱한다.
 * - 허용값: project_north | true_north
 * - 그 외 값은 fallback으로 되돌린다.
 */
export function resolveWorkspaceCoordinateFrame(
  raw: string,
  fallback: WorkspaceCoordinateFrame,
): WorkspaceCoordinateFrame {
  const normalized = raw.trim().toLowerCase()
  if (normalized === 'project_north') return 'project_north'
  if (normalized === 'true_north') return 'true_north'
  return fallback
}
