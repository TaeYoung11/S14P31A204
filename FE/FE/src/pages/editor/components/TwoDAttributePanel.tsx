import { useState } from 'react'
import { DimensionSettings } from './DimensionSettings'
import { MaterialSelector } from './MaterialSelector'

export function TwoDAttributePanel() {
  const [dims, setDims] = useState({
    length: '4,000',
    width: '3,000',
    height: '2,400',
    thickness: '200',
  })
  const [material, setMaterial] = useState('콘크리트 (회색)')

  const handleDimChange = (field: keyof typeof dims, value: string) => {
    setDims(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div className="p-5 flex flex-col gap-5">
      <DimensionSettings values={dims} onChange={handleDimChange} fields={['length', 'height', 'thickness']} />
      <MaterialSelector value={material} onChange={setMaterial} />
    </div>
  )
}
