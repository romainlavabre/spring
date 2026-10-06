// Keeps one broken block (a half-typed value) from blanking the whole page.
import { Component, type ReactNode } from 'react'

export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: unknown; fallback?: (error: Error) => ReactNode }, { error: Error | null; key: unknown }> {
  state: { error: Error | null; key: unknown } = { error: null, key: undefined }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  static getDerivedStateFromProps(props: { resetKey?: unknown }, state: { error: Error | null; key: unknown }) {
    // A change of the block gives it another chance.
    if (props.resetKey !== state.key) return { error: null, key: props.resetKey }
    return null
  }

  render() {
    if (this.state.error) {
      return this.props.fallback ? (
        this.props.fallback(this.state.error)
      ) : (
        <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-xs text-danger">This block cannot be shown: {this.state.error.message}</div>
      )
    }
    return this.props.children
  }
}
