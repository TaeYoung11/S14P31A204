interface CompassControlProps {
  rotationRadians: number
  projectNorthRotationRadians?: number
  onToggleProjectNorth?: () => void
}

const TICK_MARKS = [45, 135, 225, 315].map((rotationDegrees) => ({
  id: rotationDegrees,
  rotationDegrees,
}))

function formatDegrees(radians: number) {
  const degrees = ((radians * 180) / Math.PI) % 360
  return `${Math.round((degrees + 360) % 360)} deg`
}

export function CompassControl({
  rotationRadians,
  projectNorthRotationRadians = 0,
  onToggleProjectNorth,
}: CompassControlProps) {
  const canToggleProjectNorth = Math.abs(projectNorthRotationRadians) >= 1e-9 && !!onToggleProjectNorth
  const isProjectNorthView = Math.abs(rotationRadians - projectNorthRotationRadians) < 1e-9

  return (
    <button
      type="button"
      aria-label={`True north direction ${formatDegrees(rotationRadians)}`}
      title={canToggleProjectNorth
        ? (isProjectNorthView ? 'True north 기준 보기' : 'Project north 기준 보기')
        : 'True north 기준 보기'}
      disabled={!canToggleProjectNorth}
      onClick={onToggleProjectNorth}
      className={`relative h-16 w-16 select-none rounded-full border border-[#D3DAE8] bg-white shadow-[0_10px_24px_rgba(15,23,42,0.14)] ${
        canToggleProjectNorth ? 'cursor-pointer' : 'cursor-default'
      }`}
    >
      <div className="absolute inset-1 rounded-full border border-[#E6ECF5] bg-[#F8FAFC]" />

      <div
        className="absolute inset-0"
        style={{ transform: `rotate(${rotationRadians}rad)` }}
      >
        {TICK_MARKS.map((tick) => (
          <span
            key={tick.id}
            className="absolute inset-2"
            style={{ transform: `rotate(${tick.rotationDegrees}deg)` }}
          >
            <span
              className="absolute left-1/2 top-0 h-1.5 w-px -translate-x-1/2 rounded-full bg-[#A8B3C5]"
            />
          </span>
        ))}

        <span className="absolute left-1/2 top-2 -translate-x-1/2 text-[10px] font-black leading-none text-[#D7263D]">
          N
        </span>
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] font-bold leading-none text-[#64748B]">
          E
        </span>
        <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[8px] font-bold leading-none text-[#64748B]">
          S
        </span>
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[8px] font-bold leading-none text-[#64748B]">
          W
        </span>

        <div className="absolute left-1/2 top-[14px] h-0 w-0 -translate-x-1/2 border-x-[5px] border-b-[20px] border-x-transparent border-b-[#D7263D]" />
        <div className="absolute bottom-[14px] left-1/2 h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[20px] border-x-transparent border-t-[#2563EB]" />
      </div>

      <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-[#1F2937]" />
      <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
    </button>
  )
}
