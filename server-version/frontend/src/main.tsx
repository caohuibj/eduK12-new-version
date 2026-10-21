import React from 'react'
import ReactDOM from 'react-dom/client'
import { loadProductApp } from './product-entry'
import './index.css'

const ProductApp = React.lazy(() => loadProductApp())

class EntryErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) return <div role="alert">
      <p>页面加载失败，请检查网络后重试。</p>
      <button type="button" onClick={() => window.location.reload()}>重新加载</button>
    </div>
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <EntryErrorBoundary>
      <React.Suspense fallback={<p role="status">正在加载页面…</p>}>
        <ProductApp />
      </React.Suspense>
    </EntryErrorBoundary>
  </React.StrictMode>,
)
