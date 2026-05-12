import { getLibraryPresetFromObject, type LibraryObject3D } from './ifcLibraryMesh'

/**
 * 라이브러리 프리셋 ID 문자열을 안정적인 숫자 owner ID로 변환한다.
 * - reducer/state-machine 키 용도로만 사용
 * - 세션 동안 동일 ID는 동일 owner 숫자를 보장
 */
export const getLibraryOwnerId = (target: LibraryObject3D | null) => {
  if (!target) return null
  const preset = getLibraryPresetFromObject(target)
  if (!preset?.id) return null
  let hash = 0
  for (let index = 0; index < preset.id.length; index += 1) {
    hash = ((hash << 5) - hash) + preset.id.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash)
}

