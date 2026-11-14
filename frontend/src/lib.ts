import { useEffect, useRef, useState } from 'react'

export const lin = (d0: number, d1: number, r0: number, r1: number) => (v: number) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0)
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setSize({ width: e.contentRect.width, height: e.contentRect.height }))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, size] as const
}

/** SVG path through points, skipping nulls (gaps). */
export function pathOf(pts: ([number, number] | null)[]) {
  let d = ''
  let pen = false
  for (const p of pts) {
    if (!p) { pen = false; continue }
    d += `${pen ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`
    pen = true
  }
  return d
}

export const riskColor = (r: number) => (r >= 0.5 ? '#ef6a5b' : r >= 0.15 ? '#f0b24a' : '#62c2a6')
export const riskWord = (r: number) => (r >= 0.5 ? 'Storm likely' : r >= 0.15 ? 'Unsettled' : 'Calm')
