/** 저장된 워크스페이스 데이터가 없을 때 표시하는 프로젝트 카드 프리뷰이다. */
export default function ProjectWorkspaceEmptyPreview() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#eef2ff] via-white to-[#e0f2fe]">
      <span className="text-xs font-black text-[#94a3b8]">Preview</span>
    </div>
  )
}
