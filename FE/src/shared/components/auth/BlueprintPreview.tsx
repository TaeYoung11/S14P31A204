interface BlueprintPreviewProps {
  compact?: boolean
}

const BLUEPRINT_FONT_FAMILY = 'Pretendard Variable, Pretendard, sans-serif'

/**
 * 인증 화면 좌측 패널에 표시되는 도면 미리보기.
 * 실제 편집 기능이 아닌 브랜드 맥락을 보여주는 장식형 SVG라서 외부 상태를 받지 않는다.
 */
export default function BlueprintPreview({ compact = false }: BlueprintPreviewProps) {
  return (
    <div
      className={`max-w-[540px] rounded-2xl border border-[#e5e7eb] bg-white shadow-[0_14px_40px_rgba(17,24,39,0.06)] ${
        compact ? 'p-3 xl:p-4' : 'mt-2 p-[18px]'
      }`}
    >
      <div
        className={`flex items-center justify-between border-b border-dashed border-[#e5e7eb] font-mono uppercase tracking-[0.16em] text-[#6b7280] ${
          compact ? 'mb-2 pb-2 text-[9px]' : 'mb-3 pb-3 text-[10px]'
        }`}
      >
        <span>BATANG · 003 / PLAN</span>
        <span className="flex gap-1.5">
          <span className="h-2 w-2 rounded-full border border-[#4f46e5] bg-[#4f46e5]" />
          <span className="h-2 w-2 rounded-full border border-[#e5e7eb] bg-[#eaecf2]" />
          <span className="h-2 w-2 rounded-full border border-[#e5e7eb] bg-[#eaecf2]" />
        </span>
      </div>

      <svg
        className={`block w-full rounded-lg bg-[#fafbff] ${compact ? 'h-[clamp(82px,17vh,150px)]' : 'h-[clamp(128px,22vh,180px)]'}`}
        viewBox="0 0 540 180"
        preserveAspectRatio="none"
        aria-label="AI 설계 도면 미리보기"
      >
        <defs>
          <pattern id="auth-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(17,24,39,0.06)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="540" height="180" fill="url(#auth-grid)" />
        <rect x="40" y="20" width="460" height="140" fill="none" stroke="rgba(17,24,39,0.5)" strokeWidth="2" />
        <line x1="180" y1="20" x2="180" y2="100" stroke="rgba(17,24,39,0.5)" strokeWidth="1.5" />
        <line x1="40" y1="100" x2="320" y2="100" stroke="rgba(17,24,39,0.5)" strokeWidth="1.5" />
        <line x1="320" y1="20" x2="320" y2="160" stroke="rgba(17,24,39,0.5)" strokeWidth="1.5" />
        <line x1="320" y1="80" x2="500" y2="80" stroke="rgba(17,24,39,0.5)" strokeWidth="1.5" />
        <path d="M 180 60 A 14 14 0 0 0 194 74" fill="none" stroke="rgba(17,24,39,0.4)" strokeWidth="1" />
        <path d="M 320 130 A 14 14 0 0 1 306 144" fill="none" stroke="rgba(17,24,39,0.4)" strokeWidth="1" />
        <rect
          x="324"
          y="84"
          width="172"
          height="72"
          fill="rgba(79,70,229,0.08)"
          stroke="rgba(79,70,229,0.6)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
        <text x="334" y="102" fontFamily={BLUEPRINT_FONT_FAMILY} fontSize="9" fill="rgba(79,70,229,0.9)">
          AI · STUDIO
        </text>
        <line x1="40" y1="172" x2="500" y2="172" stroke="rgba(17,24,39,0.3)" strokeWidth="1" />
        <line x1="40" y1="168" x2="40" y2="176" stroke="rgba(17,24,39,0.3)" strokeWidth="1" />
        <line x1="500" y1="168" x2="500" y2="176" stroke="rgba(17,24,39,0.3)" strokeWidth="1" />
        <text
          x="270"
          y="168"
          textAnchor="middle"
          fontFamily={BLUEPRINT_FONT_FAMILY}
          fontSize="8"
          fill="rgba(17,24,39,0.45)"
        >
          12,400
        </text>
        <text x="50" y="36" fontFamily={BLUEPRINT_FONT_FAMILY} fontSize="8" fill="rgba(17,24,39,0.35)">
          A-01
        </text>
        <text x="190" y="36" fontFamily={BLUEPRINT_FONT_FAMILY} fontSize="8" fill="rgba(17,24,39,0.35)">
          +0.000
        </text>
        <rect x="60" y="120" width="40" height="24" fill="none" stroke="rgba(17,24,39,0.25)" strokeWidth="1" />
        <rect x="120" y="120" width="40" height="24" fill="none" stroke="rgba(17,24,39,0.25)" strokeWidth="1" />
        <circle cx="220" cy="60" r="14" fill="none" stroke="rgba(17,24,39,0.25)" strokeWidth="1" />
      </svg>

      <div
        className={`flex items-center justify-between font-mono tracking-[0.1em] text-[#6b7280] ${
          compact ? 'mt-2 text-[9px]' : 'mt-3 text-[10px]'
        }`}
      >
        <span>scale 1 : 100 · DRAFT</span>
        <span className="rounded bg-[#4f46e5]/10 px-2 py-1 font-medium text-[#4f46e5]">AI 영감 96%</span>
      </div>
    </div>
  )
}
