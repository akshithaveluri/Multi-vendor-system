import { useEffect } from 'react'

export default function DocumentList({ api, docs, setDocs, refreshKey, onDelete }) {
  useEffect(() => {
    fetch(`${api}/documents`)
      .then((r) => r.json())
      .then(setDocs)
      .catch(() => setDocs([]))
  }, [api, refreshKey, setDocs])

  const handleDelete = async (docId) => {
    try {
      await fetch(`${api}/documents/${docId}`, { method: 'DELETE' })
      onDelete()
    } catch {
      // ignore
    }
  }

  if (!docs.length) {
    return <p className="doc-empty">No contracts uploaded yet.</p>
  }

  return (
    <table className="doc-table">
      <thead>
        <tr>
          <th>Document</th>
          <th>Chunks</th>
          <th>Uploaded</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {docs.map((d) => (
          <tr key={d.doc_id}>
            <td>{d.doc_name}</td>
            <td>{d.chunk_count}</td>
            <td>{new Date(d.uploaded_at).toLocaleString()}</td>
            <td>
              <button className="delete-btn" onClick={() => handleDelete(d.doc_id)}>
                Delete
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
