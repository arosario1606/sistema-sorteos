import { useEffect, useState } from 'react'
import { api } from './lottery-api'
import { ui } from './ui'

// Confirmación para marcar a todos como asistentes. Avisa si el sorteo ya tiene ganadores, porque marcar
// a todos vuelve elegibles a personas que no asistieron.
export default function MarkAllModal({ idSorteos, total, pending, onClose, onDone }) {
  const [winners, setWinners] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.sorteo(idSorteos).then((d) => setWinners(d.counts.winners)).catch(() => {})
  }, [idSorteos])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !busy && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const confirm = async () => {
    setError('')
    setBusy(true)
    try {
      onDone((await api.marcarTodos(idSorteos)).marked)
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="markall-title" className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 id="markall-title" className="text-xl font-semibold text-primary">Marcar a todos como asistentes</h2>
        <p className="mt-2 text-sm text-gray-800">
          Se {pending === 1 ? 'marcará como asistente' : 'marcarán como asistentes'}{' '}
          <b>{pending === 1 ? '1 participante pendiente' : `${pending} participantes pendientes`}</b> de los {total} del sorteo.
          Los que ya estaban marcados no cambian.
        </p>
        {winners > 0 && (
          <p role="alert" className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            Este sorteo ya tiene <b>{winners === 1 ? '1 ganador' : `${winners} ganadores`}</b>. Si marca a todos, también podrán
            salir ganadores quienes no asistieron.
          </p>
        )}
        {error && <p className={ui.error}>{error}</p>}
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" className={ui.btnOutline} onClick={onClose} disabled={busy} autoFocus>Cancelar</button>
          <button type="button" className={ui.btnPrimary} onClick={confirm} disabled={busy}>
            {busy ? 'Marcando…' : 'Sí, marcar a todos'}
          </button>
        </div>
      </div>
    </div>
  )
}
