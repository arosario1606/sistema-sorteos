import { useEffect, useMemo, useState } from 'react'
import { api } from './lottery-api'
import MarkAllModal from './mark-all-modal'
import SorteoSelect from './sorteo-select'
import { ui } from './ui'

// Listar asistencia: cada check se guarda al instante.
const ListAssist = () => {
  const [idSorteos, setIdSorteos] = useState(null)
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [pending, setPending] = useState(new Set())
  const [error, setError] = useState('')
  const [confirmingAll, setConfirmingAll] = useState(false)
  const [notice, setNotice] = useState('')

  const selectSorteo = (id) => {
    setRows([])
    setError('')
    setNotice('')
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
  const pendingCount = rows.length - attendedCount

  const setAttended = (id, attended) =>
    setRows((rs) => rs.map((r) => (r.idParticipant === id ? { ...r, attended } : r)))

  // Se marca de inmediato; si el servidor falla se revierte.
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

  // El servidor marca a todos de una vez; después se vuelve a leer la lista para mostrar el estado real.
  const markedAll = async (marked) => {
    setConfirmingAll(false)
    setNotice(marked === 1 ? 'Se marcó 1 participante como asistente.' : `Se marcaron ${marked} participantes como asistentes.`)
    try {
      setRows((await api.asistencia(idSorteos)).rows)
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className={ui.card}>
      <h2 className={ui.title}>Listado de asistencia</h2>
      <SorteoSelect value={idSorteos} onChange={selectSorteo}>
        <input
          type="search"
          className={`${ui.input} w-full sm:w-80`}
          placeholder="Buscar por nombre, cédula, cargo o gerencia"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={!idSorteos}
        />
        <button className={ui.btnOutline} onClick={() => setConfirmingAll(true)} disabled={!idSorteos || pendingCount === 0}>
          Marcar a todos como asistentes
        </button>
      </SorteoSelect>
      {error && <p className={ui.error}>{error}</p>}
      {notice && <p className={ui.success} role="status">{notice}</p>}
      {idSorteos && (
        <>
          <div className={ui.stats}>
            <span>Cantidad asistentes: <b>{attendedCount}</b></span>
            <span>Participantes: <b>{rows.length}</b></span>
          </div>
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th className={ui.th}>Cédula</th>
                  <th className={ui.th}>Nombre y apellido</th>
                  <th className={ui.th}>Cargo</th>
                  <th className={ui.th}>Gerencia</th>
                  <th className={`${ui.th} ${ui.center}`}>Asistencia</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.idParticipant} className={r.attended ? 'bg-green-50' : ''}>
                    <td className={ui.td}>{r.cedula}</td>
                    <td className={ui.td}>{r.fullName}</td>
                    <td className={ui.td}>{r.jobTitle}</td>
                    <td className={ui.td}>{r.department}</td>
                    <td className={`${ui.td} ${ui.center}`}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer accent-accent"
                        aria-label={`Asistencia de ${r.fullName}`}
                        checked={r.attended}
                        disabled={pending.has(r.idParticipant)}
                        onChange={() => toggle(r)}
                      />
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr><td colSpan="5" className={`${ui.td} ${ui.center} ${ui.hint}`}>Sin resultados</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
      {confirmingAll && (
        <MarkAllModal
          idSorteos={idSorteos}
          total={rows.length}
          pending={pendingCount}
          onClose={() => setConfirmingAll(false)}
          onDone={markedAll}
        />
      )}
    </div>
  )
}

export default ListAssist
