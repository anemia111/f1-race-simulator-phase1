import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { preview } from 'vite'

const sourceRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const server = await preview({
  root: sourceRoot,
  logLevel: 'error',
  preview: {
    host: '127.0.0.1',
    port: 0,
    strictPort: false,
  },
})

const address = server.httpServer.address()

if (!address || typeof address === 'string') {
  await new Promise((resolveClose) => server.httpServer.close(resolveClose))
  throw new Error('Could not resolve the built-app preview address.')
}

process.env.APP_URL = `http://127.0.0.1:${address.port}/`

try {
  await import(`./broadcast-playtest.mjs?run=${Date.now()}`)
} finally {
  await new Promise((resolveClose, rejectClose) => {
    server.httpServer.close((error) => {
      if (error) rejectClose(error)
      else resolveClose()
    })
  })
}
