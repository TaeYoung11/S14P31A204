import { Group, Line, Shape, Text } from 'react-konva'
import type { FloorLayerOverlay } from '../../types'
import { hexToRgba } from '../../utils/bubbleCalc'
import { radiansToDegrees } from '../../utils/canvasViewTransform'
import {
  getRoomTransformProps,
  renderRoomContourPath,
  toPolygonPoints,
  toRectPolygonPoints,
} from './twoDCanvas.utils'
import { fitSingleLineFontSize } from './canvasTextFit'

interface TwoDOverlayLayersProps {
  overlayLayers: FloorLayerOverlay[]
  viewRotationRadians?: number
}

/**
 * 비활성 층 겹쳐보기 오버레이를 렌더링한다.
 * - Room 원형(컨투어/폴리곤/사각형)을 동일 규칙으로 표시한다.
 */
export function TwoDOverlayLayers({
  overlayLayers,
  viewRotationRadians = 0,
}: TwoDOverlayLayersProps) {
  const inverseViewRotationDegrees = -radiansToDegrees(viewRotationRadians)

  return (
    <>
      {overlayLayers.map((overlay) => (
        <Group key={`overlay-${overlay.layerId}`} listening={false}>
          {overlay.rooms.map((room) => {
            const polygonPoints = toPolygonPoints(room.polygon)
            const contour = room.contour
            const fill = hexToRgba(room.color, Math.min(Math.max(overlay.opacity * 0.35, 0.06), 0.35))
            const labelPaddingX = Math.min(12, Math.max(3, room.width * 0.04))
            const labelPaddingY = Math.min(10, Math.max(3, room.height * 0.04))
            const labelWidth = Math.max(8, room.width - labelPaddingX * 2)
            const labelHeight = Math.max(1, (room.height - labelPaddingY * 2) * 0.5)
            const labelFontSize = fitSingleLineFontSize(overlay.layerName, labelWidth, labelHeight / 1.15)
            const labelLineHeight = labelFontSize * 1.15
            const labelCenterX = room.x + room.width / 2
            const labelCenterY = room.y + room.height / 2
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
                <Group
                  x={labelCenterX}
                  y={labelCenterY}
                  rotation={inverseViewRotationDegrees}
                >
                  <Text
                    x={-labelWidth / 2}
                    y={-labelLineHeight / 2}
                    width={labelWidth}
                    height={labelLineHeight}
                    align="center"
                    verticalAlign="middle"
                    text={overlay.layerName}
                    fontSize={labelFontSize}
                    lineHeight={1.15}
                    fontStyle="bold"
                    fill="#6B7A99"
                  />
                </Group>
              </Group>
            )
          })}
        </Group>
      ))}
    </>
  )
}
