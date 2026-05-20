export function shouldTrustFloorPlanHistoryForIfcSource(params: {
  historyRevision: string | null
  sourceRevision: string | null
  hasSourceIfcUrl: boolean
}): boolean {
  const { historyRevision, sourceRevision, hasSourceIfcUrl } = params
  return !hasSourceIfcUrl || sourceRevision === null || historyRevision === sourceRevision
}
