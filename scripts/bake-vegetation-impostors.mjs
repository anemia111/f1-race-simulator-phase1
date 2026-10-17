import { createServer } from 'vite'
import { chromium } from 'playwright'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const server = await createServer({
  server: { host: '127.0.0.1', port: 0 },
  logLevel: 'error',
  plugins: [
    {
      name: 'vegetation-baker',
      configureServer(s) {
        s.middlewares.use('/__vegetation-bake', (_, res) => {
          res.setHeader('Content-Type', 'text/html')
          res.end(
            '<!doctype html><script type="module" src="/scripts/vegetation-bake-client.ts"></script>',
          )
        })
      },
    },
  ],
})
await server.listen()
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 512, height: 512 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(
    `http://127.0.0.1:${server.httpServer.address().port}/__vegetation-bake`,
  )
  await page.waitForFunction(
    () => window.vegetationReady,
    {},
    { timeout: 60000 },
  )
  const manifest = JSON.parse(
    await readFile('public/cinematic/sources.json', 'utf8'),
  )
  for (const name of ['ash', 'oak', 'pine']) {
    const result = await page.evaluate(
      (name) => window.bakeVegetation(name),
      name,
    )
    const bytes = Buffer.from(result.image.split(',')[1], 'base64'),
      file = `tree-${name}-impostor.png`
    await writeFile(`public/cinematic/${file}`, bytes)
    manifest.assets = manifest.assets.filter((a) => a.file !== file)
    manifest.assets.push({
      file,
      source: 'https://github.com/dgreenheck/ez-tree',
      license: 'MIT',
      creator: 'Daniel Greenheck; render derived by this project',
      acquiredAt: '2026-10-17',
      sha256: createHash('sha256').update(bytes).digest('hex'),
      bytes: bytes.length,
      confidence: 'Generic generated tree, not Suzuka survey',
      changes:
        '512px neutral-light orthographic render of near tree for distant camera-facing impostor. 20m square framing; billboard centre 7m above root.',
    })
    console.log(`${file}: ${bytes.length} bytes`)
  }
  if (errors.length) throw new Error(errors.join('\n'))
  await writeFile(
    'public/cinematic/sources.json',
    JSON.stringify(manifest, null, 2) + '\n',
  )
} finally {
  await browser.close()
  await server.close()
}
