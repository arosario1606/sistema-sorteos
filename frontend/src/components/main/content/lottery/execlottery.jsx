import { useCallback, useEffect, useRef, useState } from 'react'
import DrawStage from './draw-stage'
import FinalizeModal from './finalize-modal'
import { api } from './lottery-api'
import SorteoSelect from './sorteo-select'
import { ui } from './ui'
import WinnersGrid from './winners-grid'

const SPIN_MS = 3500
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Ejecutar sorteo: cada pulsación saca un ganador. Los ganadores se ven todos a la vez (sin scroll) y la
// «pantalla completa» deja solo el sorteo para proyectarlo. «Finalizar» borra el sorteo y sus datos.
const ExecLottery = () => {
  const [idSorteos, setIdSorteos] = useState(null)
  const [info, setInfo] = useState(null)
  const [winners, setWinners] = useState([])
  const [pool, setPool] = useState([])
  const [spinning, setSpinning] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)
  const [shown, setShown] = useState('')
  const [latest, setLatest] = useState(null)
  const [error, setError] = useState('')
  const [remaining, setRemainingCount] = useState(null)
  const [presenting, setPresenting] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const timer = useRef(null)

  const reset = () => {
    setInfo(null)
    setWinners([])
    setPool([])
    setLatest(null)
    setRemainingCount(null)
    setError('')
  }

  const selectSorteo = (id) => {
    reset()
    setIdSorteos(id)
  }

  useEffect(() => {
    if (!idSorteos) return
    api.sorteo(idSorteos).then(setInfo).catch((e) => setError(e.message))
    api.ganadores(idSorteos)
      .then((d) => {
        setWinners(d.winners)
        setRemainingCount(d.remaining)
      })
      .catch((e) => setError(e.message))
    api.asistencia(idSorteos)
      .then((d) => setPool(d.rows.filter((r) => r.attended).map((r) => r.fullName)))
      .catch(() => {})
  }, [idSorteos])

  useEffect(() => () => clearInterval(timer.current), [])

  // Pantalla completa: se superpone al menú de la intranet y, si el navegador lo permite, usa la API de pantalla completa.
  const enterPresentation = async () => {
    setPresenting(true)
    try {
      await document.documentElement.requestFullscreen?.()
    } catch {
      // Sin API de pantalla completa igual queda a pantalla llena dentro de la ventana.
    }
  }
  const exitPresentation = useCallback(async () => {
    setPresenting(false)
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {})
  }, [])

  useEffect(() => {
    if (!presenting) return undefined
    const onFullscreenChange = () => !document.fullscreenElement && setPresenting(false)
    const onKey = (e) => e.key === 'Escape' && exitPresentation()
    document.addEventListener('fullscreenchange', onFullscreenChange)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      document.removeEventListener('keydown', onKey)
    }
  }, [presenting, exitPresentation])

  const run = async () => {
    setError('')
    setLatest(null)
    setSpinning(true)
    const start = Date.now()
    timer.current = setInterval(() => {
      setTimeLeft(Math.max(0, SPIN_MS - (Date.now() - start)))
      if (pool.length) setShown(pool[Math.floor(Math.random() * pool.length)])
    }, 90)
    try {
      // El ganador se decide en el servidor mientras corre el reloj.
      const [winner] = await Promise.all([api.ejecutar(idSorteos), sleep(SPIN_MS)])
      setLatest(winner)
      setWinners((w) => [...w, winner])
      setRemainingCount(winner.remaining)
    } catch (e) {
      if (e.body?.finished) setRemainingCount(0)
      setError(e.message)
    } finally {
      clearInterval(timer.current)
      setSpinning(false)
    }
  }

  const finished = remaining === 0
  const drawButton = (
    <button
      className={`${ui.btnAccent} text-base`}
      onClick={run}
      disabled={!idSorteos || remaining === null || spinning || finished}
      title="Sacar un ganador"
    >
      ★ Sortear ganador #{winners.length + 1}
    </button>
  )

  return (
    <div className={presenting ? 'fixed inset-0 z-[1000] flex flex-col gap-3 overflow-hidden bg-sky-50 p-4' : ui.card}>
      {presenting ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="truncate text-2xl font-semibold text-primary">{info?.name}</h2>
          <div className="flex items-center gap-3">
            {drawButton}
            <button className={ui.btnOutline} onClick={exitPresentation}>Salir de pantalla completa</button>
          </div>
        </div>
      ) : (
        <>
          <h2 className={ui.title}>Ejecutar sorteo</h2>
          <SorteoSelect value={idSorteos} onChange={selectSorteo} refreshKey={refreshKey}>
            {drawButton}
            <button className={ui.btnOutline} onClick={enterPresentation} disabled={!idSorteos}>Pantalla completa</button>
            <button className={ui.btnDanger} onClick={() => setFinalizing(true)} disabled={!info || spinning}>Finalizar sorteo</button>
          </SorteoSelect>
        </>
      )}

      <DrawStage spinning={spinning} clock={(timeLeft / 1000).toFixed(1)} shown={shown} latest={latest} />
      {finished && !spinning && (
        <p className={ui.success}>
          {winners.length > 0
            ? `Ya no quedan participantes elegibles: salieron ${winners.length} ganadores. Puede finalizar el sorteo.`
            : 'No hay participantes elegibles: marque la asistencia y cargue los cupos por gerencia.'}
        </p>
      )}
      {error && !finished && <p className={ui.error}>{error}</p>}

      {idSorteos && (
        <>
          <h3 className={presenting ? 'text-lg font-semibold text-gray-800' : ui.subtitle}>Ganadores ({winners.length})</h3>
          <div className={presenting ? 'min-h-0 flex-1' : ''}>
            <WinnersGrid winners={winners} latestOrder={latest?.winningOrder} presenting={presenting} />
          </div>
        </>
      )}

      {finalizing && info && (
        <FinalizeModal
          sorteo={{ idSorteos, name: info.name }}
          winners={winners}
          onClose={() => setFinalizing(false)}
          onDone={() => {
            setFinalizing(false)
            reset()
            setIdSorteos(null)
            setRefreshKey((k) => k + 1)
          }}
        />
      )}
    </div>
  )
}

export default ExecLottery
