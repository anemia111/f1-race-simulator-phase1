import { createServer } from 'vite'
import { readFile, writeFile } from 'node:fs/promises'
const root = new URL('../', import.meta.url)
const definitions = JSON.parse(await readFile(new URL('src/data/cornerReferenceDefinitions.json', root), 'utf8'))
const layouts = JSON.parse(await readFile(new URL('src/data/expansionCourseLayouts.json', root), 'utf8')).layouts
const server = await createServer({ root: root.pathname.replace(/^\/(\w:)/, '$1'), server: { middlewareMode: true }, appType: 'custom' })
try {
  const { supportTimingFor } = await server.ssrLoadModule('/src/data/supportTiming.ts')
  const { motorsportCourses } = await server.ssrLoadModule('/src/motorsport/packages.ts')
  const aligned = motorsportCourses('indycar')
  const references = definitions.references.map(reference => {
    const points = reference.frame === 'support-aligned'
      ? supportTimingFor(reference.id).centerline.map(([x, , z]) => [x, z])
      : reference.frame === 'expansion-aligned' ? aligned.find(course => course.id === reference.id).points
        : layouts.find(layout => layout.id === reference.id).centerlineMeters
    const lengths = points.map((point, i) => Math.hypot(point[0] - points[(i + 1) % points.length][0], point[1] - points[(i + 1) % points.length][1]))
    const total = lengths.reduce((sum, value) => sum + value, 0)
    return { ...reference, turns: reference.turns.map(turn => {
      let remaining = turn.progress * total, i = 0
      while (i < lengths.length - 1 && remaining > lengths[i]) remaining -= lengths[i++]
      const a = points[i], b = points[(i + 1) % points.length], f = remaining / lengths[i]
      return { ...turn, position: a.map((value, axis) => Number((value + (b[axis] - value) * f).toFixed(6))) }
    }) }
  })
  await writeFile(new URL('src/data/courseCornerReferences.json', root), JSON.stringify({ checkedOn: definitions.checkedOn, references }, null, 2) + '\n')
  console.log(`Registered official corner labels on ${references.length} layouts`)
} finally { await server.close() }
