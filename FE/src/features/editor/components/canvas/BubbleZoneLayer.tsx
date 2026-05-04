import { Group, Line, Text } from 'react-konva'
import type { BubbleData, ZoneData } from '../../types'
import { hexToRgba } from '../../utils/bubbleCalc'
import { getZoneOrganicShape } from '../../utils/zoneShape'
import type { ZoneStyle } from './bubbleZoneStyles'

interface ZoneLayerProps {
  zones: ZoneData[]
  bubbles: BubbleData[]
  style: ZoneStyle
  onEditZone: (zone: ZoneData) => void
}

/**
 * 조닝 영역 목록을 유기적 도형으로 렌더링하는 서브 레이어.
 * 자동/수동 조닝 모두 동일 로직을 사용하며 스타일만 달라진다.
 */
export default function BubbleZoneLayer({ zones, bubbles, style, onEditZone }: ZoneLayerProps) {
  return (
    <>
      {zones.map((zone) => {
        const shape = getZoneOrganicShape(zone, bubbles, style.padding)
        if (!shape) return null

        return (
          <Group
            key={zone.id}
            onClick={(e) => {
              e.cancelBubble = true
              onEditZone(zone)
            }}
            onTap={(e) => {
              e.cancelBubble = true
              onEditZone(zone)
            }}
          >
            <Line
              points={shape.points}
              closed
              fill={hexToRgba(zone.color, style.fillOpacity)}
              stroke={zone.color}
              strokeWidth={style.strokeWidth}
              dash={style.dash}
              tension={style.tension}
              lineJoin="round"
              lineCap="round"
            />
            <Text
              text={zone.name}
              x={shape.labelX}
              y={shape.labelY}
              fontSize={style.fontSize}
              fontStyle="bold"
              fill={zone.color}
            />
          </Group>
        )
      })}
    </>
  )
}
