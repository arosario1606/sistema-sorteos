import { useEffect, useRef, useState } from 'react'
import { api } from './lottery-api'
import { ui } from './ui'
import { buildWinnersCsv, downloadCsv, winnersFileName } from './winners-csv'

// Confirmación para finalizar un sorteo: borra TODO de forma definitiva. Pide escribir el nombre del sorteo
// y ofrece descargar antes los ganadores en CSV (única copia que queda fuera de la base de datos).
export default function FinalizeModal({ sorteo, winners, onClose, onDone }) {
  const [info, setInfo] = useState(null)
  const [typed, setTyped] = useState('')
  const [phase, setPhase] = useState('confirm') // confirm | deleting | done
  const [error, setError] = useState('')
  const doneTimer = useRef(null)

  useEffect(() => {
    api.sorteo(sorteo.idSorteos).then(setInfo).catch((e) => setError(e.message))
  }, [sorteo.idSorteos])

  useEffect(() => () => clearTimeout(doneTimer.current), [])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && phase === 'confirm' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [phase, onClose])

  const matches = typed.trim().toLowerCase() === sorteo.name.trim().toLowerCase()

  const confirm = async () => {
    setError('')
    setPhase('deleting')
    try {
      await api.finalizar(sorteo.idSorteos)
      setPhase('done')
      doneTimer.current = setTimeout(onDone, 1800)
    } catch (e) {
      setError(e.message)
      setPhase('confirm')
    }
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="finalize-title" className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        {phase === 'done' ? (
          <div className="py-8 text-center" aria-live="polite">
            <div className="relative mx-auto mb-4 h-20 w-20">
              <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-30" />
              <span className="absolute inset-0 flex animate-bounce items-center justify-center rounded-full bg-accent text-4xl text-white">✓</span>
            </div>
            <h2 className="text-xl font-semibold text-accent">Sorteo finalizado</h2>
            <p className={ui.hint}>Los datos del sorteo fueron eliminados.</p>
          </div>
        ) : (
          <>
            <h2 id="finalize-title" className="text-xl font-semibold text-red-600">Finalizar sorteo «{sorteo.name}»</h2>
            <p className="mt-2 text-sm text-gray-800">
              Se <b>borrarán de forma definitiva</b> {info ? <b>{info.counts.participants} participantes</b> : 'los participantes'},{' '}
              <b>{winners.length} ganadores</b>, los cupos y las gerencias que ningún otro sorteo use. Esta acción no se puede deshacer.
            </p>
            <div className="my-4 rounded-md bg-sky-50 p-3">
              <p className={ui.hint}>Descargue los ganadores antes de finalizar: después no habrá forma de recuperarlos.</p>
              <button
                type="button"
                className={`${ui.btnOutline} mt-2`}
                disabled={winners.length === 0}
                onClick={() => downloadCsv(winnersFileName(sorteo.name), buildWinnersCsv(winners))}
              >
                Descargar ganadores (CSV)
              </button>
              {winners.length === 0 && <span className={`${ui.hint} ml-2`}>Aún no hay ganadores.</span>}
            </div>
            <label className={ui.field}>
              Para confirmar, escriba el nombre del sorteo
              <input
                className={ui.input}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={sorteo.name}
                disabled={phase === 'deleting'}
                autoFocus
              />
            </label>
            {error && <p className={ui.error}>{error}</p>}
            <div className="mt-4 flex justify-end gap-3">
              <button type="button" className={ui.btnOutline} onClick={onClose} disabled={phase === 'deleting'}>Cancelar</button>
              <button type="button" className={ui.btnDanger} onClick={confirm} disabled={!matches || phase === 'deleting'}>
                {phase === 'deleting' ? 'Borrando…' : 'Finalizar y borrar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
