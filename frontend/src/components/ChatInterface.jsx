import { useState } from 'react'

export default function ChatInterface({ api, docs }) {
  const [query, setQuery] = useState('')
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)

  const handleSend = async () => {
    const q = query.trim()
    if (!q || loading) return
    setQuery('')
    setMessages((prev) => [...prev, { role: 'user', text: q }])
    setLoading(true)

    try {
      const res = await fetch(`${api}/query?q=${encodeURIComponent(q)}`)
      if (!res.ok) throw new Error('Query failed')
      const data = await res.json()
      setMessages((prev) => [
        ...prev,
        {
          role: 'bot',
          text: data.answer,
          sources: data.sources || [],
        },
      ])
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: 'bot', text: `Error: ${e.message}`, sources: [] },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div>
      {!docs.length && (
        <p className="no-docs-msg">Upload contracts first to ask questions about them.</p>
      )}

      <div className="messages">
        {messages.length === 0 && (
          <p style={{ color: '#999', fontSize: '0.85rem', textAlign: 'center', padding: 24 }}>
            Ask a question about your uploaded contracts, e.g. "Compare pricing terms"
          </p>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            <div>{m.text}</div>
            {m.sources?.length > 0 && (
              <div className="sources">
                Sources: {m.sources.map((s, j) => <span key={j}>{s.doc_name}</span>)}
              </div>
            )}
          </div>
        ))}

        {loading && <div className="msg bot">Thinking...</div>}
      </div>

      <div className="chat-input-row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your contracts..."
          disabled={loading}
        />
        <button onClick={handleSend} disabled={loading || !query.trim()}>
          Send
        </button>
      </div>
    </div>
  )
}
