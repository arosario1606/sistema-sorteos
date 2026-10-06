import { useEffect, useRef, useState } from 'react'
import { api } from './lottery-api'
import SorteoSelect from './sorteo-select'
import { ui } from './ui'
import WinnersTable from './winners-table'

const SPIN_MS = 3500
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Ejecutar sorteo: cada pulsación saca un ganador hasta que no queden elegibles.
const ExecLottery = () => {
  const [idSorteos, setIdSorteos] = useState(null)
  const [winners, setWinners] = useState([])
  const [pool, setPool] = useState([])
  const [spinning, setSpinning] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)
  const [shown, setShown] = useState('')
  const [latest, setLatest] = useState(null)
  const [error, setError] = useState('')
  const [remaining, setRemainingCount] = useState(null)
  const timer = useRef(null)

  const selectSorteo = (id) => {
    setWinners([])
    setPool([])
    setLatest(null)
    setRemainingCount(null)
    setError('')
    setIdSorteos(id)
  }

  useEffect(() => {
    if (!idSorteos) return
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

  const clock = (timeLeft / 1000).toFixed(1)
  const finished = remaining === 0
  const nextOrder = winners.length + 1

  return (
    <div className={ui.card}>
      <h2 className={ui.title}>Ejecutar sorteo</h2>
      <SorteoSelect value={idSorteos} onChange={selectSorteo}>
        <button
          className={`${ui.btnAccent} text-base`}
          onClick={run}
          disabled={!idSorteos || remaining === null || spinning || finished}
          title="Sacar un ganador"
        >
          ★ Sortear ganador #{nextOrder}
        </button>
      </SorteoSelect>

      {spinning && (
        <div className="my-4 rounded-lg bg-sky-50 p-8 text-center" aria-live="polite">
          <div className="text-4xl font-bold text-primary">{clock}s</div>
          <div className="mt-2 text-xl text-gray-600">{shown || '…'}</div>
        </div>
      )}
      {!spinning && latest && (
        <div className="my-4 rounded-lg bg-green-50 p-8 text-center" aria-live="polite">
          <div className="text-lg font-semibold text-accent">🏆 Ganador #{latest.winningOrder}</div>
          <div className="mt-1 text-3xl font-bold text-gray-800">{latest.names} {latest.lastName}</div>
          <div className="mt-1 text-gray-600">{latest.jobTitle} · {latest.department}</div>
        </div>
      )}
      {finished && !spinning && (
        <p className={ui.success}>
          {winners.length > 0
            ? `Sorteo finalizado: ya salieron los ${winners.length} ganadores.`
            : 'No hay participantes elegibles: marque la asistencia y cargue los cupos por gerencia.'}
        </p>
      )}
      {error && !finished && <p className={ui.error}>{error}</p>}

      {idSorteos && <WinnersTable winners={winners} latestOrder={latest?.winningOrder} />}
    </div>
  )
}

export default ExecLottery
