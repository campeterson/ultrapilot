import { PAGE_LAYOUTS, type PageLayoutId } from '../../../data/logic/instrument-layouts'
import { theme } from '../../theme'

interface LayoutThumbnailProps {
  layoutId: PageLayoutId
  active?: boolean
  size?: number
}

export function LayoutThumbnail({ layoutId, active = false, size = 80 }: LayoutThumbnailProps) {
  const layout = PAGE_LAYOUTS[layoutId]
  const PAD = 4
  const GAP = 3
  const cellW = (size - PAD * 2 - GAP * (layout.cols - 1)) / layout.cols
  const cellH = (size - PAD * 2 - GAP * (layout.rows - 1)) / layout.rows

  const fill = active ? 'rgba(192,57,43,0.35)' : 'rgba(253,246,227,0.10)'
  const stroke = active ? theme.colors.red : theme.colors.dim

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {layout.slots.map((slot, i) => {
        const colSpan = slot.colSpan ?? 1
        const rowSpan = slot.rowSpan ?? 1
        const x = PAD + (slot.col - 1) * (cellW + GAP)
        const y = PAD + (slot.row - 1) * (cellH + GAP)
        const w = cellW * colSpan + GAP * (colSpan - 1)
        const h = cellH * rowSpan + GAP * (rowSpan - 1)
        return (
          <rect
            key={i}
            x={x} y={y} width={w} height={h}
            rx="2" ry="2"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.25"
          />
        )
      })}
    </svg>
  )
}
