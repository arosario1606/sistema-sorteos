import { useState } from 'react'
import { ui } from './ui'
import UploadResult from './upload-result'

// Formulario de carga de un CSV con su resumen de resultado.
export default function FileUpload({ label, help, onUpload, summary }) {
  const [file, setFile] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setResult(null)
    setBusy(true)
    try {
      setResult(await onUpload(file))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="my-4 rounded-md border border-gray-200 p-4" onSubmit={submit}>
      <h3 className="font-semibold text-gray-800">{label}</h3>
      <p className={ui.hint}>{help}</p>
      <div className={ui.toolbar}>
        <input
          type="file"
          accept=".csv,text/csv"
          className="text-sm"
          onChange={(e) => setFile(e.target.files[0] ?? null)}
        />
        <button className={ui.btnAccent} disabled={!file || busy}>
          {busy ? 'Subiendo…' : 'Subir'}
        </button>
      </div>
      {error && <p className={ui.error}>{error}</p>}
      <UploadResult result={result} summary={summary} />
    </form>
  )
}
