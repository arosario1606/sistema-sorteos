import { useEffect, useState } from 'react'
import { api, formatDate } from '../api'

// Selector de sorteo; avisa al padre con el id elegido.
export default function SorteoSelect({ value, onChange, refreshKey = 0, children }) {
  const [sorteos, setSorteos] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    api.sorteos().then(setSorteos).catch((e) => setError(e.message))
  }, [refreshKey])

  return (
    <div className="toolbar">
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">Seleccione sorteo</option>
        {sorteos.map((s) => (
          <option key={s.idSorteos} value={s.idSorteos}>
            {s.name} — {formatDate(s.sorteoDate)}
          </option>
        ))}
      </select>
      {children}
      {error && <span className="msg error">{error}</span>}
    </div>
  )
}
