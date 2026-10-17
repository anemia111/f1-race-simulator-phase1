import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('virtual:pwa-register', () => ({ registerSW: vi.fn() }))

const reload = vi.fn()
beforeEach(() => {
  vi.resetModules()
  reload.mockClear()
  vi.stubGlobal('window', { location: { origin: 'http://127.0.0.1:5176', reload } })
})
afterEach(() => vi.unstubAllGlobals())

describe('app update detection and explicit reload', () => {
  it('checks the uncached manifest even when no service worker is registered', async () => {
    const pwa = await import('./pwa')
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ buildId: pwa.currentBuild })))
    vi.stubGlobal('fetch', fetch)
    await pwa.checkAppUpdate()
    expect(pwa.appUpdateSnapshot().status).toBe('current')
    expect(fetch.mock.calls[0][1].cache).toBe('no-store')
    expect(String(fetch.mock.calls[0][0])).toContain('/build-info.json?check=')
    expect(reload).not.toHaveBeenCalled()
  })

  it('announces a newer build without interrupting the current page', async () => {
    const pwa = await import('./pwa')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ buildId: 'newer-build' }))))
    const listener = vi.fn()
    const unsubscribe = pwa.subscribeAppUpdate(listener)
    await pwa.checkAppUpdate()
    expect(pwa.appUpdateSnapshot()).toMatchObject({ status: 'available', latestBuild: 'newer-build' })
    expect(listener).toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('does not claim the current page is latest when the server is down or its manifest is invalid', async () => {
    const pwa = await import('./pwa')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')))
    await pwa.checkAppUpdate()
    expect(pwa.appUpdateSnapshot().status).toBe('offline')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ buildId: 123 }))))
    await pwa.checkAppUpdate()
    expect(pwa.appUpdateSnapshot().status).toBe('offline')
  })

  it('deduplicates overlapping checks', async () => {
    const pwa = await import('./pwa')
    let resolve: (response: Response) => void = () => undefined
    const fetch = vi.fn(() => new Promise<Response>(done => { resolve = done }))
    vi.stubGlobal('fetch', fetch)
    const first = pwa.checkAppUpdate()
    const second = pwa.checkAppUpdate()
    expect(first).toBe(second)
    resolve(new Response(JSON.stringify({ buildId: pwa.currentBuild })))
    await first
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('reloads only after the explicit update action confirms the server is reachable', async () => {
    const pwa = await import('./pwa')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ buildId: 'newer-build' }))))
    await pwa.applyAppUpdate()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('keeps the current page open when applying an update fails', async () => {
    const pwa = await import('./pwa')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await pwa.applyAppUpdate()
    expect(pwa.appUpdateSnapshot().status).toBe('error')
    expect(reload).not.toHaveBeenCalled()
  })
})
