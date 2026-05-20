import { Box, Cuboid, DraftingCompass, Image as ImageIcon, Network } from 'lucide-react'
import type { EditorMode } from '@/features/editor/types'

interface ProjectFallbackThumbnailProps {
  mode: EditorMode | null
}

const MODE_THUMBNAIL_META: Record<EditorMode, {
  label: string
  Icon: typeof Network
  className: string
}> = {
  bubble: {
    label: 'Bubble',
    Icon: Network,
    className: 'from-[#eff6ff] via-white to-[#ecfeff] text-[#2563eb]',
  },
  '2d': {
    label: '2D',
    Icon: DraftingCompass,
    className: 'from-[#f0fdf4] via-white to-[#f7fee7] text-[#16a34a]',
  },
  '3d': {
    label: '3D',
    Icon: Cuboid,
    className: 'from-[#fff7ed] via-white to-[#fffbeb] text-[#ea580c]',
  },
  view: {
    label: 'Render',
    Icon: ImageIcon,
    className: 'from-[#111827] via-[#1f2937] to-[#334155] text-white',
  },
}

/**
 * 저장된 이미지가 없을 때 마지막 작업 모드를 시각적으로 알려주는 카드 썸네일이다.
 */
export default function ProjectFallbackThumbnail({ mode }: ProjectFallbackThumbnailProps) {
  if (!mode) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#eef2ff] via-white to-[#e0f2fe]">
        <Box className="h-12 w-12 text-[#c7d2fe]" />
      </div>
    )
  }

  const meta = MODE_THUMBNAIL_META[mode]
  const Icon = meta.Icon

  return (
    <div className={`relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br ${meta.className}`}>
      {mode === 'bubble' && <BubbleDecoration />}
      {mode === '2d' && <TwoDDecoration />}
      {mode === '3d' && (
        <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-xl border border-current/20 bg-white/45 shadow-[18px_18px_0_rgba(255,255,255,0.28)]" />
      )}
      <div className={`relative z-10 flex h-16 w-16 items-center justify-center rounded-2xl border ${
        mode === 'view' ? 'border-white/15 bg-white/10' : 'border-white/80 bg-white/75'
      } shadow-sm backdrop-blur-sm`}>
        <Icon className="h-8 w-8" strokeWidth={1.8} />
      </div>
      <span className={`absolute bottom-3 left-3 rounded-full px-2.5 py-1 text-[11px] font-black ${
        mode === 'view' ? 'bg-white/12 text-white/85' : 'bg-white/80 text-[#334155]'
      }`}>
        {meta.label}
      </span>
    </div>
  )
}

function BubbleDecoration() {
  return (
    <div className="absolute inset-0 opacity-70">
      <span className="absolute left-[24%] top-[28%] h-10 w-10 rounded-full border-2 border-current/30 bg-white/60" />
      <span className="absolute left-[48%] top-[42%] h-14 w-14 rounded-full border-2 border-current/25 bg-white/70" />
      <span className="absolute right-[22%] top-[25%] h-8 w-8 rounded-full border-2 border-current/30 bg-white/60" />
      <span className="absolute left-[34%] top-[50%] h-px w-[32%] rotate-12 bg-current/20" />
      <span className="absolute left-[54%] top-[39%] h-px w-[22%] -rotate-[24deg] bg-current/20" />
    </div>
  )
}

function TwoDDecoration() {
  return (
    <div className="absolute inset-x-[20%] top-[24%] grid h-[54%] grid-cols-2 gap-2 opacity-80">
      <span className="rounded-md border-2 border-current/25 bg-white/70" />
      <span className="rounded-md border-2 border-current/25 bg-white/55" />
      <span className="col-span-2 rounded-md border-2 border-current/25 bg-white/65" />
    </div>
  )
}
