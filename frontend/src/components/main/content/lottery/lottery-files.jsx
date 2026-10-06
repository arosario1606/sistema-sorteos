import { useEffect, useState } from 'react'
import FileUpload from './file-upload'
import { api, formatDate } from './lottery-api'
import { ui } from './ui'

// Paso 2: carga de participantes y cupos del sorteo elegido, con el resumen de lo cargado.
export default function LotteryFiles({ idSorteos }) {
  const [info, setInfo] = useState(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    api.sorteo(idSorteos).then(setInfo).catch(() => setInfo(null))
  }, [idSorteos, tick])

  if (!info) return null
  const refresh = (r) => {
    setTick((t) => t + 1)
    return r
  }

  return (
    <div className={ui.card}>
      <h2 className={ui.title}>2. Cargar archivos de «{info.name}»</h2>
      <p className={ui.hint}>
        {formatDate(info.sorteoDate)} · Sedes: {info.sedes.map((s) => s.name).join(', ')}
      </p>
      <FileUpload
        label="Participantes (CSV de RRHH)"
        help="Columnas, sin encabezado: cédula; apellidos; nombres; cargo; gerencia; participa (SI/NO)."
        onUpload={async (f) => refresh(await api.subirParticipantes(idSorteos, f))}
        summary={(r) =>
          `${r.created} participantes nuevos, ${r.updated} actualizados, ${r.employeesCreated} empleados registrados.`}
      />
      <FileUpload
        label="Cupos de ganadores por gerencia (CSV)"
        help="Columnas: gerencia; cantidad. Se aplican a todo el grupo de sedes."
        onUpload={async (f) => refresh(await api.subirCupos(idSorteos, f))}
        summary={(r) => `${r.saved} cupos guardados.`}
      />
      <div className={ui.stats}>
        <span>Participantes cargados: <b>{info.counts.participants}</b></span>
        <span>Gerencias con cupo: <b>{info.quotas.length}</b></span>
      </div>
      {info.quotas.length > 0 && (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr><th className={ui.th}>Gerencia</th><th className={ui.th}>Cupo de ganadores</th></tr>
            </thead>
            <tbody>
              {info.quotas.map((q) => (
                <tr key={q.idDepartment}>
                  <td className={ui.td}>{q.department}</td>
                  <td className={ui.td}>{q.allowedQuantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
