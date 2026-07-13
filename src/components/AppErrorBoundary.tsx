import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { hasError: boolean }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('F1 simulator render recovery', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="app-recovery" role="alert">
          <span>SIMULATOR RECOVERY</span>
          <strong>Data update interrupted the display.</strong>
          <button onClick={() => window.location.reload()} type="button">
            Reload race control
          </button>
        </main>
      )
    }

    return this.props.children
  }
}
