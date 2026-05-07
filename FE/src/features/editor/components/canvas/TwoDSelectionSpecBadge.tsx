import { Group, Rect, Text } from 'react-konva'

interface TwoDSelectionSpecBadgeProps {
  x: number
  y: number
  width: number
  height: number
  text: string
}

/**
 * 선택된 도면 요소(Room/Wall/Opening)의 스펙 정보를 배지 형태로 렌더링한다.
 */
export function TwoDSelectionSpecBadge({
  x,
  y,
  width,
  height,
  text,
}: TwoDSelectionSpecBadgeProps) {
  return (
    <Group listening={false}>
      <Rect
        x={x}
        y={y}
        width={width}
        height={height}
        cornerRadius={8}
        fill="#FFFFFF"
        stroke="#D7DCEF"
        strokeWidth={1}
        shadowColor="#1D2438"
        shadowBlur={4}
        shadowOpacity={0.1}
      />
      <Text
        x={x + 7}
        y={y + 4}
        text={text}
        fontSize={10}
        fontStyle="bold"
        fill="#1D2438"
      />
    </Group>
  )
}
