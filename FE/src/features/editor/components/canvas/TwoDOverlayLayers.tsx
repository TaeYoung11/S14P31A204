import { Group, Line, Shape, Text } from 'react-konva'
import type { FloorLayerOverlay } from '../../types'
import { hexToRgba } from '../../utils/bubbleCalc'
import {
  getRoomTransformProps,
  renderRoomContourPath,
  toPolygonPoints,
  toRectPolygonPoints,
} from './twoDCanvas.utils'

interface TwoDOverlayLayersProps {
  overlayLayers: FloorLayerOverlay[]
}

/**
 * 비활성 층 겹쳐보기 오버레이를 렌더링한다.
 * - Room 원형(컨투어/폴리곤/사각형)을 동일 규칙으로 표시한다.
 */
export function TwoDOverlayLayers({ overlayLayers }: TwoDOverlayLayersProps) {
  return (
    <>
      {overlayLayers.map((overlay) => (
        <Group key={`overlay-${overlay.layerId}`} listening={false}>
          {overlay.rooms.map((room) => {
            const polygonPoints = toPolygonPoints(room.polygon)
            const contour = room.contour
            const fill = hexToRgba(room.color, Math.min(Math.max(overlay.opacity * 0.35, 0.06), 0.35))
            return (
              <Group
                key={`overlay-room-${overlay.layerId}-${room.id}`}
                listening={false}
                {...getRoomTransformProps(room)}
              >
                {contour && contour.length > 0 ? (
                  <Shape
                    sceneFunc={(context, shape) => {
                      context.beginPath()
                      renderRoomContourPath(context, contour)
                      context.closePath()
                      context.fillStrokeShape(shape)
                    }}
                    fill={fill}
                    stroke="#6B7A99"
                    strokeWidth={1}
                    dash={[6, 4]}
                  />
                ) : polygonPoints ? (
                  <Line
                    points={polygonPoints}
                    closed
                    fill={fill}
                    stroke="#6B7A99"
                    strokeWidth={1}
                    dash={[6, 4]}
                    lineJoin="round"
                  />
                ) : (
                  <Line
                    points={toRectPolygonPoints(room)}
                    closed
                    fill={fill}
                    stroke="#6B7A99"
                    strokeWidth={1}
                    dash={[6, 4]}
                    lineJoin="round"
                  />
                )}
                <Text
                  x={room.x}
                  y={room.y + room.height / 2 - 6}
                  width={room.width}
                  align="center"
                  text={overlay.layerName}
                  fontSize={9}
                  fontStyle="bold"
                  fill="#6B7A99"
                />
              </Group>
            )
          })}
        </Group>
      ))}
    </>
  )
}
