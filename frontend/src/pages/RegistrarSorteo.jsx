import { useEffect, useState } from 'react'
import { api, formatDate } from '../api'
import SorteoSelect from '../components/SorteoSelect'
import UploadResult from '../components/UploadResult'

const today = () => new Date().toISOString().slice(0, 10)

function NuevoSorteo({ sedes, onCreated }) {
  const [name, setName] = useState('')
  const [date, setDate] = useState(today())
  const [selected, setSelected] = useState([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const toggle = (id) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const sorteo = await api.crearSorteo({ name, sorteoDate: date, sedeIds: selected })
      setName('')
      setSelected([])
      onCreated(sorteo.idSorteos)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>1. Registrar sorteo</h2>
      <div className="grid2">
        <label>
          Fecha del sorteo
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label>
          Nombre del sorteo
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
      </div>
      <fieldset>
        <legend>Sedes que participan (grupo del sorteo)</legend>
        <div className="chips">
          {sedes.map((s) => (
            <label key={s.idSede} className={`chip ${selected.includes(s.idSede) ? 'on' : ''}`}>
              <input type="checkbox" checked={selected.includes(s.idSede)} onChange={() => toggle(s.idSede)} />
              {s.name}
            </label>
          ))}
        </div>
      </fieldset>
      {error && <p className="msg error">{error}</p>}
      <button className="primary" disabled={saving || selected.length === 0}>
        {saving ? 'Guardando…' : 'Crear sorteo'}
      </button>
    </form>
  )
}

function FileUpload({ label, help, onUpload, summary }) {
  const [file, setFile] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setResult(null)
    setBusy(true)
    try {
      setResult(await onUpload(file))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="upload" onSubmit={submit}>
      <h3>{label}</h3>
      <p className="hint">{help}</p>
      <div className="toolbar">
        <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files[0] ?? null)} />
        <button className="success" disabled={!file || busy}>{busy ? 'Subiendo…' : 'Subir'}</button>
      </div>
      {error && <p className="msg error">{error}</p>}
      <UploadResult result={result} summary={summary} />
    </form>
  )
}

function CargaArchivos({ idSorteos }) {
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
    <div className="card">
      <h2>2. Cargar archivos de «{info.name}»</h2>
      <p className="hint">
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
      <div className="stats">
        <span>Participantes cargados: <b>{info.counts.participants}</b></span>
        <span>Gerencias con cupo: <b>{info.quotas.length}</b></span>
      </div>
      {info.quotas.length > 0 && (
        <table>
          <thead><tr><th>Gerencia</th><th>Cupo de ganadores</th></tr></thead>
          <tbody>
            {info.quotas.map((q) => (
              <tr key={q.idDepartment}><td>{q.department}</td><td>{q.allowedQuantity}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default function RegistrarSorteo() {
  const [sedes, setSedes] = useState([])
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    api.me().then((me) => setSedes(me.sedes)).catch((e) => setError(e.message))
  }, [])

  return (
    <>
      {error && <p className="msg error">{error}</p>}
      <NuevoSorteo
        sedes={sedes}
        onCreated={(id) => {
          setRefreshKey((k) => k + 1)
          setSelected(id)
        }}
      />
      <div className="card">
        <h2>Sorteo a configurar</h2>
        <SorteoSelect value={selected} onChange={setSelected} refreshKey={refreshKey} />
      </div>
      {selected && <CargaArchivos key={selected} idSorteos={selected} />}
    </>
  )
}
