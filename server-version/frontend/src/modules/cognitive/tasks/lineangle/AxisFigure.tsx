import React from 'react'
import { axisAngle } from './prng'
/** Fixed viewBox geometry and aspect ratio, independent of display width. */
export const AxisFigure: React.FC<{angle: number; width?: number; className?: string}> = ({angle, width = 120, className}) => {
  const radians = axisAngle(angle) * Math.PI / 180
  const dx = Math.cos(radians) * 52, dy = -Math.sin(radians) * 52
  return <svg width={width} height={width * 112 / 120} viewBox="0 0 120 112" className={className} role="img" aria-label="无向线段">
    <line x1={60-dx} y1={56-dy} x2={60+dx} y2={56+dy} stroke="#334155" strokeWidth="5" strokeLinecap="round" />
  </svg>
}
