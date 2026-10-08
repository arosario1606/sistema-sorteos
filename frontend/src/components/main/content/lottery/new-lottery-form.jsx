import { useState } from 'react'
import { api } from './lottery-api'
import { ui } from './ui'

const today = () => new Date().toISOString().slice(0, 10)

// Paso 1: fecha, nombre y sedes que forman el grupo del sorteo.
export default function NewLotteryForm({ sedes, onCreated }) {
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
    <form className={ui.card} onSubmit={submit}>
      <h2 className={ui.title}>1. Registrar sorteo</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={ui.field}>
          Fecha del sorteo
          <input className={ui.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className={ui.field}>
          Nombre del sorteo
          <input className={ui.input} value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
      </div>
      <fieldset className="my-4">
        <legend className="mb-2 text-sm text-gray-600">Sedes que participan (grupo del sorteo)</legend>
        {sedes.length === 0 && <p className={ui.hint}>No tiene sedes habilitadas para crear sorteos.</p>}
        <div className="flex flex-wrap gap-2">
          {sedes.map((s) => {
            const on = selected.includes(s.idSede)
            return (
              <label
                key={s.idSede}
                className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
                  on ? 'border-primary bg-primary text-white' : 'border-gray-300 bg-white text-gray-800'
                }`}
              >
                <input type="checkbox" checked={on} onChange={() => toggle(s.idSede)} />
                {s.name}
              </label>
            )
          })}
        </div>
      </fieldset>
      {error && <p className={ui.error}>{error}</p>}
      <button className={ui.btnPrimary} disabled={saving || selected.length === 0}>
        {saving ? 'Guardando…' : 'Crear sorteo'}
      </button>
    </form>
  )
}
