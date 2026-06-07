import { useState, useCallback } from 'react'
import UploadSection from './components/UploadSection'
import DocumentList from './components/DocumentList'
import ChatInterface from './components/ChatInterface'
import Dashboard from './components/Dashboard'

const API = 'http://localhost:8000'
const TABS = [
  { key: 'upload', label: 'Upload' },
  { key: 'documents', label: 'Documents' },
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'chat', label: 'Chat' },
]

export default function App() {
  const [docs, setDocs] = useState([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [tab, setTab] = useState('upload')

  const refreshDocs = useCallback(() => setRefreshKey(k => k + 1), [])

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <h1>Ideavize AI</h1>
          <p className="subtitle">Intelligent Multi-Vendor Contract Finalization System</p>
        </div>
      </header>

      <nav className="tabs">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="main">
        {tab === 'upload' && (
          <section className="card">
            <h2>Upload Contract</h2>
            <UploadSection api={API} onUpload={refreshDocs} />
          </section>
        )}

        {tab === 'documents' && (
          <section className="card">
            <h2>Uploaded Documents</h2>
            <DocumentList api={API} docs={docs} setDocs={setDocs} refreshKey={refreshKey} onDelete={refreshDocs} />
          </section>
        )}

        {tab === 'dashboard' && (
          <section className="card">
            <h2>Contract Analysis Dashboard</h2>
            <Dashboard api={API} docs={docs} />
          </section>
        )}

        {tab === 'chat' && (
          <section className="card chat-card">
            <h2>Ask About Contracts</h2>
            <ChatInterface api={API} docs={docs} />
          </section>
        )}
      </main>
    </div>
  )
}
