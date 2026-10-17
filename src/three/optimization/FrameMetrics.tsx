import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'

export type RenderMetrics = {
  fps: number
  sampleFrames: number
  sampleDurationMs: number
  reportedAt: number
  p95Ms: number
  calls: number
  triangles: number
  geometries: number
  textures: number
  gpuMs: number | null
  renderCpuMs: number
  heapMiB: number | null
  renderer: string
  width: number
  height: number
}
declare global {
  interface Window {
    __cinematicMetrics?: RenderMetrics
  }
}

/** Count actual renders, including shadow passes. rAF rate alone is not a rendering benchmark. */
export function FrameMetrics({
  onMetrics,
}: {
  onMetrics: (m: RenderMetrics) => void
}) {
  const times = useRef<number[]>([]),
    last = useRef(0),
    report = useRef(0)
  const pending = useRef<WebGLQuery | null>(null),
    gpu = useRef<number | null>(null)
  const renderer = useThree((s) => s.gl)
  useEffect(
    () => () => {
      if (pending.current)
        (renderer.getContext() as WebGL2RenderingContext).deleteQuery(
          pending.current,
        )
    },
    [renderer],
  )
  useFrame(({ gl, scene, camera }) => {
    const now = performance.now()
    if (last.current) times.current.push(now - last.current)
    last.current = now
    const ctx = gl.getContext() as WebGL2RenderingContext,
      timer = ctx.getExtension('EXT_disjoint_timer_query_webgl2')
    if (
      pending.current &&
      timer &&
      ctx.getQueryParameter(pending.current, ctx.QUERY_RESULT_AVAILABLE)
    ) {
      gpu.current = ctx.getParameter(timer.GPU_DISJOINT_EXT)
        ? null
        : Number(ctx.getQueryParameter(pending.current, ctx.QUERY_RESULT)) / 1e6
      ctx.deleteQuery(pending.current)
      pending.current = null
    }
    const query = timer && !pending.current ? ctx.createQuery() : null
    if (query) ctx.beginQuery(timer.TIME_ELAPSED_EXT, query)
    const began = performance.now()
    gl.info.autoReset = false
    gl.info.reset()
    gl.render(scene, camera)
    const renderCpuMs = performance.now() - began
    if (query) {
      ctx.endQuery(timer.TIME_ELAPSED_EXT)
      pending.current = query
    }
    if (now - report.current > 1000 && times.current.length) {
      const a = times.current.toSorted((x, y) => x - y),
        ext = ctx.getExtension('WEBGL_debug_renderer_info')
      const memory = (
        performance as Performance & { memory?: { usedJSHeapSize: number } }
      ).memory
      const m: RenderMetrics = {
        fps: 1000 / (a.reduce((sum, x) => sum + x, 0) / a.length),
        sampleFrames: a.length,
        sampleDurationMs: a.reduce((sum, x) => sum + x, 0),
        reportedAt: now,
        p95Ms: a[Math.floor(a.length * 0.95)],
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
        gpuMs: gpu.current,
        renderCpuMs,
        heapMiB: memory ? memory.usedJSHeapSize / 1048576 : null,
        renderer: ext
          ? String(ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL))
          : String(ctx.getParameter(ctx.RENDERER)),
        width: gl.domElement.width,
        height: gl.domElement.height,
      }
      window.__cinematicMetrics = m
      onMetrics(m)
      times.current = []
      report.current = now
    }
  }, 1)
  return null
}
