import { ui } from './ui'

// Escenario del sorteo: cuenta regresiva con nombres que giran y, al terminar, el último ganador.
export default function DrawStage({ spinning, clock, shown, latest }) {
  if (spinning) {
    return (
      <div className="rounded-lg bg-sky-50 p-4 text-center" aria-live="polite">
        <div className="text-4xl font-bold text-primary">{clock}s</div>
        <div className="mt-1 truncate text-xl text-gray-600">{shown || '…'}</div>
      </div>
    )
  }
  if (!latest) return null
  return (
    <div className="rounded-lg bg-green-50 p-4 text-center" aria-live="polite">
      <div className="text-lg font-semibold text-accent">🏆 Ganador #{latest.winningOrder}</div>
      <div className="truncate text-3xl font-bold text-gray-800">{latest.names} {latest.lastName}</div>
      <div className={ui.hint}>{latest.department}</div>
    </div>
  )
}
