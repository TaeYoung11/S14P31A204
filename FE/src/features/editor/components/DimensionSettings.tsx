interface DimensionValues {
  length: string
  width: string
  height: string
  thickness: string
}

type DimensionField = keyof DimensionValues

interface DimensionSettingsProps {
  values?: DimensionValues
  onChange?: (field: DimensionField, value: string) => void
  fields?: DimensionField[]
}

const DEFAULT_VALUES: DimensionValues = {
  length: '4,000',
  width: '3,000',
  height: '2,400',
  thickness: '200',
}

const FIELD_META: Record<DimensionField, { label: string }> = {
  length: { label: '길이 (mm)' },
  width: { label: '가로 (mm)' },
  height: { label: '높이 (mm)' },
  thickness: { label: '두께 (mm)' },
}

const DEFAULT_FIELDS: DimensionField[] = ['length', 'width', 'height', 'thickness']

export function DimensionSettings({ values, onChange, fields = DEFAULT_FIELDS }: DimensionSettingsProps) {
  const v = values ?? DEFAULT_VALUES

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[10px] font-bold text-[#3B45B3]">치수 설정</h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {fields.map((field) => (
          <div key={field} className="flex flex-col gap-1.5">
            <label className="text-[9px] font-bold text-[#ADB5BD] uppercase">{FIELD_META[field].label}</label>
            <input
              type="text"
              value={v[field]}
              onChange={e => onChange?.(field, e.target.value)}
              className="bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] focus:ring-1 focus:ring-[#3B45B3] outline-none"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
