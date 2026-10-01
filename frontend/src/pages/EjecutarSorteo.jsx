import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import SorteoSelect from '../components/SorteoSelect'

const SPIN_MS = 5000
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export default function EjecutarSorteo() {
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
    <div className="card">
      <h2>Ejecutar sorteo</h2>
      <SorteoSelect value={idSorteos} onChange={selectSorteo}>
        <button className="success star" onClick={run} disabled={!idSorteos || remaining === null || spinning || finished} title="Sacar un ganador">
          ★ Sortear ganador #{nextOrder}
        </button>
      </SorteoSelect>

      {spinning && (
        <div className="stage">
          <div className="clock">{clock}s</div>
          <div className="spinner-name">{shown || '…'}</div>
        </div>
      )}
      {!spinning && latest && (
        <div className="stage winner-reveal">
          <div className="trophy">🏆 Ganador #{latest.winningOrder}</div>
          <div className="winner-name">{latest.names} {latest.lastName}</div>
          <div className="winner-meta">{latest.jobTitle} · {latest.department}</div>
        </div>
      )}
      {finished && !spinning && (
        <p className="msg done">
          {winners.length > 0
            ? `Sorteo finalizado: ya salieron los ${winners.length} ganadores.`
            : 'No hay participantes elegibles: marque la asistencia y cargue los cupos por gerencia.'}
        </p>
      )}
      {error && !finished && <p className="msg error">{error}</p>}

      {idSorteos && (
        <>
          <h3>Ganadores ({winners.length})</h3>
          <table>
            <thead><tr><th>Orden</th><th>Cédula</th><th>Nombre y apellido</th><th>Cargo</th><th>Gerencia</th></tr></thead>
            <tbody>
              {winners.map((w) => (
                <tr key={w.winningOrder} className={latest?.winningOrder === w.winningOrder ? 'attended' : ''}>
                  <td className="center">{w.winningOrder}</td>
                  <td>{w.cedula}</td>
                  <td>{w.names} {w.lastName}</td>
                  <td>{w.jobTitle}</td>
                  <td>{w.department}</td>
                </tr>
              ))}
              {winners.length === 0 && <tr><td colSpan="5" className="center hint">Aún no hay ganadores</td></tr>}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
