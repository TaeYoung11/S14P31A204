interface BlueprintPreviewProps {
  compact?: boolean
}

const BLUEPRINT_FONT_FAMILY = 'Pretendard Variable, Pretendard, sans-serif'

/** 실제 도면 편집기가 아닌, 인증 화면에서 제품 맥락을 전달하는 정적 SVG 프리뷰. */
export default function BlueprintPreview({ compact = false }: BlueprintPreviewProps) {
  return (
    <div
      className={`auth-blueprint-card max-w-[540px] rounded-2xl border border-white/70 bg-white/85 shadow-[0_24px_70px_rgba(15,23,42,0.12)] ${
        compact ? 'p-3 xl:p-4' : 'mt-2 p-[18px]'
      }`}
    >
      <div
        className={`flex items-center justify-between border-b border-dashed border-[#e5e7eb] font-mono uppercase tracking-[0.16em] text-[#6b7280] ${
          compact ? 'mb-2 pb-2 text-[9px]' : 'mb-3 pb-3 text-[10px]'
        }`}
      >
        <span>BATANG WORKSPACE / DESIGN REVIEW</span>
        <span className="flex gap-1.5">
          <span className="h-2 w-2 rounded-full border border-[#3B45B3] bg-[#3B45B3]" />
          <span className="h-2 w-2 rounded-full border border-[#e5e7eb] bg-[#eaecf2]" />
          <span className="h-2 w-2 rounded-full border border-[#e5e7eb] bg-[#eaecf2]" />
        </span>
      </div>

      <svg
        className={`auth-blueprint-svg block w-full rounded-lg bg-[#f8fbff] ${
          compact ? 'h-[clamp(116px,19vh,168px)]' : 'h-[clamp(148px,24vh,196px)]'
        }`}
        viewBox="0 0 540 196"
        preserveAspectRatio="none"
        aria-label="BATANG 설계 협업 미리보기"
      >
        <defs>
          <linearGradient id="auth-plan-fill" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(59,69,179,0.14)" />
            <stop offset="52%" stopColor="rgba(45,54,145,0.09)" />
            <stop offset="100%" stopColor="rgba(20,184,166,0.10)" />
          </linearGradient>
          <linearGradient id="auth-model-face" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#eef2ff" />
          </linearGradient>
          <linearGradient id="auth-model-side" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#dbeafe" />
            <stop offset="100%" stopColor="#ede9fe" />
          </linearGradient>
          <pattern id="auth-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(17,24,39,0.06)" strokeWidth="1" />
          </pattern>
        </defs>

        <rect width="540" height="196" fill="#f8fbff" />
        <rect width="540" height="196" fill="url(#auth-grid)" opacity="0.82" />

        <rect x="24" y="24" width="298" height="132" rx="12" fill="rgba(255,255,255,0.58)" stroke="rgba(226,232,240,0.9)" />
        <text x="40" y="45" fontFamily={BLUEPRINT_FONT_FAMILY} fontSize="10" fontWeight="700" fill="rgba(59,69,179,0.88)">
          AI PLAN
        </text>
        <rect x="42" y="61" width="236" height="74" fill="none" stroke="rgba(17,24,39,0.46)" strokeWidth="2" />
        <line x1="126" y1="61" x2="126" y2="104" stroke="rgba(17,24,39,0.38)" strokeWidth="1.4" />
        <line x1="42" y1="104" x2="196" y2="104" stroke="rgba(17,24,39,0.38)" strokeWidth="1.4" />
        <line x1="196" y1="61" x2="196" y2="135" stroke="rgba(17,24,39,0.38)" strokeWidth="1.4" />
        <rect x="202" y="88" width="70" height="42" rx="3" fill="url(#auth-plan-fill)" stroke="rgba(59,69,179,0.62)" strokeDasharray="5 5" />
        <path d="M126 85 A14 14 0 0 0 140 99" fill="none" stroke="rgba(17,24,39,0.28)" strokeWidth="1.1" />
        <path d="M196 116 A13 13 0 0 1 183 129" fill="none" stroke="rgba(17,24,39,0.28)" strokeWidth="1.1" />
        <rect x="58" y="116" width="34" height="14" fill="none" stroke="rgba(17,24,39,0.22)" />
        <rect x="104" y="116" width="34" height="14" fill="none" stroke="rgba(17,24,39,0.22)" />
        <text x="212" y="106" fontFamily={BLUEPRINT_FONT_FAMILY} fontSize="8" fill="rgba(59,69,179,0.9)">
          REVIEW
        </text>

        <g transform="translate(344 38)">
          <rect x="0" y="0" width="154" height="118" rx="14" fill="rgba(255,255,255,0.72)" stroke="rgba(226,232,240,0.95)" />
          <text x="18" y="24" fontFamily={BLUEPRINT_FONT_FAMILY} fontSize="10" fontWeight="700" fill="rgba(15,23,42,0.78)">
            3D MODEL
          </text>
          <polygon points="58,42 102,58 70,74 26,57" fill="url(#auth-model-face)" stroke="rgba(59,69,179,0.34)" />
          <polygon points="26,57 70,74 70,108 26,90" fill="#eef2ff" stroke="rgba(59,69,179,0.24)" />
          <polygon points="70,74 102,58 102,92 70,108" fill="url(#auth-model-side)" stroke="rgba(59,69,179,0.24)" />
          <polygon points="58,26 102,42 102,58 58,42" fill="rgba(59,69,179,0.18)" stroke="rgba(59,69,179,0.28)" />
          <polygon points="58,26 26,41 26,57 58,42" fill="rgba(45,54,145,0.12)" stroke="rgba(59,69,179,0.20)" />
          <line x1="42" y1="68" x2="42" y2="97" stroke="rgba(59,69,179,0.18)" />
          <line x1="86" y1="66" x2="86" y2="100" stroke="rgba(59,69,179,0.18)" />
          <rect x="18" y="82" width="42" height="22" rx="6" fill="rgba(255,255,255,0.74)" stroke="rgba(226,232,240,0.9)" />
          <circle cx="30" cy="93" r="4" fill="#3B45B3" />
          <text x="40" y="96" fontFamily={BLUEPRINT_FONT_FAMILY} fontSize="8" fontWeight="700" fill="rgba(15,23,42,0.65)">
            SYNC
          </text>
        </g>

        <g transform="translate(42 164)">
          <rect x="0" y="0" width="118" height="20" rx="10" fill="rgba(59,69,179,0.10)" />
          <circle cx="14" cy="10" r="4" fill="#3B45B3" />
          <text x="24" y="13" fontFamily={BLUEPRINT_FONT_FAMILY} fontSize="9" fontWeight="700" fill="rgba(59,69,179,0.9)">
            PLAN UPDATED
          </text>
        </g>
        <g transform="translate(170 164)">
          <rect x="0" y="0" width="112" height="20" rx="10" fill="rgba(20,184,166,0.10)" />
          <circle cx="14" cy="10" r="4" fill="#14b8a6" />
          <text x="24" y="13" fontFamily={BLUEPRINT_FONT_FAMILY} fontSize="9" fontWeight="700" fill="rgba(15,118,110,0.9)">
            AI READY
          </text>
        </g>
        <g transform="translate(292 164)">
          <rect x="0" y="0" width="128" height="20" rx="10" fill="rgba(15,23,42,0.06)" />
          <circle cx="14" cy="10" r="4" fill="#94a3b8" />
          <text x="24" y="13" fontFamily={BLUEPRINT_FONT_FAMILY} fontSize="9" fontWeight="700" fill="rgba(51,65,85,0.82)">
            REVIEW MODE
          </text>
        </g>
        <path d="M310 98 C324 86, 326 76, 338 70" fill="none" stroke="rgba(59,69,179,0.46)" strokeWidth="1.6" strokeDasharray="4 5" />
        <circle cx="310" cy="98" r="4" fill="#3B45B3" />
        <circle cx="338" cy="70" r="4" fill="#3B45B3" />
        <text x="302" y="88" fontFamily={BLUEPRINT_FONT_FAMILY} fontSize="8" fontWeight="700" fill="rgba(59,69,179,0.82)">
          sync
        </text>
      </svg>

      <div
        className={`flex items-center justify-between font-mono tracking-[0.1em] text-[#6b7280] ${
          compact ? 'mt-2 text-[9px]' : 'mt-3 text-[10px]'
        }`}
      >
        <span>AI plan to model sync</span>
        <span className="rounded bg-[#3B45B3]/10 px-2 py-1 font-medium text-[#3B45B3]">LIVE REVIEW</span>
      </div>
    </div>
  )
}
