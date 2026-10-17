import { useSyncExternalStore } from 'react'
import { appUpdateSnapshot, applyAppUpdate, checkAppUpdate, subscribeAppUpdate } from '../pwa'

export function AppUpdateNotice() {
  const update = useSyncExternalStore(subscribeAppUpdate, appUpdateSnapshot)
  if (import.meta.env.DEV) return null
  const messages = {
    idle: '画面の更新', checking: '更新を確認中…', current: '最新の画面です',
    available: '新しい画面を利用できます', offline: 'サーバーに接続できません。保存版を表示中です',
    applying: '最新版へ切り替え中…', error: '更新できませんでした。接続を確認して再試行してください',
  }
  const actionable = update.status === 'available' || update.status === 'error'
  const builtAt = update.currentBuild.match(/\d{4}-\d{2}-\d{2}T[\d:.]+Z$/)?.[0]
  const versionLabel = builtAt ? new Date(builtAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : update.currentBuild
  return <aside className={`app-update-notice app-update-${update.status}`} aria-label="画面の更新">
    <span role="status">{messages[update.status]}</span>
    <small title={update.currentBuild}>画面版: {versionLabel}</small>
    {actionable && <small>切り替えると画面を再読み込みします。</small>}
    <button type="button" disabled={update.status === 'checking' || update.status === 'applying'}
      onClick={() => { void (actionable ? applyAppUpdate() : checkAppUpdate()) }}>
      {actionable ? '最新版を表示' : '更新を確認'}
    </button>
  </aside>
}
