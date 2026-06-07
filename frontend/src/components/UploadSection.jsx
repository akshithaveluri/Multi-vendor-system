import { useState, useRef } from 'react'

export default function UploadSection({ api, onUpload }) {
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const inputRef = useRef(null)

  const handleFile = (f) => {
    if (f && f.type === 'application/pdf') {
      setFile(f)
      setStatus('')
    } else {
      setStatus('error: Please select a PDF file')
    }
  }

  const handleUpload = async () => {
    if (!file) return
    setLoading(true)
    setStatus('')
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`${api}/upload`, { method: 'POST', body: form })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Upload failed')
      }
      const data = await res.json()
      setStatus(`success: ${data.doc_name} uploaded (${data.chunks} chunks)`)
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      onUpload()
    } catch (e) {
      setStatus(`error: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    handleFile(f)
  }

  return (
    <div>
      <div
        className="upload-zone"
        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('dragover') }}
        onDragLeave={(e) => e.currentTarget.classList.remove('dragover')}
        onDrop={(e) => { e.currentTarget.classList.remove('dragover'); handleDrop(e) }}
        onClick={() => inputRef.current?.click()}
      >
        <p>Drag & drop a PDF here, or click to select</p>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          onChange={(e) => handleFile(e.target.files[0])}
        />
        {file && <p style={{ marginTop: 8, color: '#333' }}>{file.name}</p>}
      </div>

      <div style={{ marginTop: 12, textAlign: 'center' }}>
        <button className="upload-btn" disabled={!file || loading} onClick={handleUpload}>
          {loading ? 'Uploading...' : 'Upload Contract'}
        </button>
      </div>

      {status && (
        <p className={`upload-status ${status.startsWith('success') ? 'success' : 'error'}`}>
          {status}
        </p>
      )}
    </div>
  )
}
