/**
 * 선택 컬렉션 병합 유틸.
 * 기존 선택과 새 선택을 key 기준으로 dedupe 하여 append 선택을 안정적으로 처리한다.
 */
export function mergeSelectionByKey<T>(
  current: T[],
  incoming: T[],
  getKey: (entry: T) => string,
) {
  const byKey = new Map<string, T>()
  current.forEach((entry) => byKey.set(getKey(entry), entry))
  incoming.forEach((entry) => byKey.set(getKey(entry), entry))
  return Array.from(byKey.values())
}
