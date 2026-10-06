import { ui } from './ui'

// Ganadores en orden de salida; resalta el último.
export default function WinnersTable({ winners, latestOrder }) {
  return (
    <>
      <h3 className={ui.subtitle}>Ganadores ({winners.length})</h3>
      <div className={ui.tableWrap}>
        <table className={ui.table}>
          <thead>
            <tr>
              <th className={`${ui.th} ${ui.center}`}>Orden</th>
              <th className={ui.th}>Cédula</th>
              <th className={ui.th}>Nombre y apellido</th>
              <th className={ui.th}>Cargo</th>
              <th className={ui.th}>Gerencia</th>
            </tr>
          </thead>
          <tbody>
            {winners.map((w) => (
              <tr key={w.winningOrder} className={latestOrder === w.winningOrder ? 'bg-green-50' : ''}>
                <td className={`${ui.td} ${ui.center}`}>{w.winningOrder}</td>
                <td className={ui.td}>{w.cedula}</td>
                <td className={ui.td}>{w.names} {w.lastName}</td>
                <td className={ui.td}>{w.jobTitle}</td>
                <td className={ui.td}>{w.department}</td>
              </tr>
            ))}
            {winners.length === 0 && (
              <tr><td colSpan="5" className={`${ui.td} ${ui.center} ${ui.hint}`}>Aún no hay ganadores</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
