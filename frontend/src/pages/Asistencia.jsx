import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import SorteoSelect from '../components/SorteoSelect'

export default function Asistencia() {
  const [idSorteos, setIdSorteos] = useState(null)
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [pending, setPending] = useState(new Set())
  const [error, setError] = useState('')

  const selectSorteo = (id) => {
    setRows([])
    setError('')
    setIdSorteos(id)
  }

  useEffect(() => {
    if (!idSorteos) return
    api.asistencia(idSorteos).then((d) => setRows(d.rows)).catch((e) => setError(e.message))
  }, [idSorteos])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => `${r.fullName} ${r.cedula} ${r.jobTitle} ${r.department}`.toLowerCase().includes(q))
  }, [rows, search])

  const attendedCount = rows.filter((r) => r.attended).length

  const setAttended = (id, attended) =>
    setRows((rs) => rs.map((r) => (r.idParticipant === id ? { ...r, attended } : r)))

  // Cada check se guarda de inmediato; si falla se revierte.
  const toggle = async (row) => {
    const next = !row.attended
    setError('')
    setAttended(row.idParticipant, next)
    setPending((p) => new Set(p).add(row.idParticipant))
    try {
      await api.marcarAsistencia(idSorteos, row.idParticipant, next)
    } catch (e) {
      setAttended(row.idParticipant, !next)
      setError(e.message)
    } finally {
      setPending((p) => {
        const n = new Set(p)
        n.delete(row.idParticipant)
        return n
      })
    }
  }

  return (
    <div className="card">
      <h2>Listado de asistencia</h2>
      <SorteoSelect value={idSorteos} onChange={selectSorteo}>
        <input
          type="search"
          placeholder="Buscar por nombre, cédula, cargo o gerencia"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={!idSorteos}
        />
      </SorteoSelect>
      {error && <p className="msg error">{error}</p>}
      {idSorteos && (
        <>
          <div className="stats">
            <span>Cantidad asistentes: <b>{attendedCount}</b></span>
            <span>Participantes: <b>{rows.length}</b></span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Cédula</th><th>Nombre y apellido</th><th>Cargo</th><th>Gerencia</th><th>Asistencia</th></tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.idParticipant} className={r.attended ? 'attended' : ''}>
                    <td>{r.cedula}</td>
                    <td>{r.fullName}</td>
                    <td>{r.jobTitle}</td>
                    <td>{r.department}</td>
                    <td className="center">
                      <input
                        type="checkbox"
                        aria-label={`Asistencia de ${r.fullName}`}
                        checked={r.attended}
                        disabled={pending.has(r.idParticipant)}
                        onChange={() => toggle(r)}
                      />
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr><td colSpan="5" className="center hint">Sin resultados</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
