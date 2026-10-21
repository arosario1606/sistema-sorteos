import { useEffect, useState } from 'react'
import { api } from './lottery-api'
import {
  canSearch, clearVisible, filterSedes, idsToSave, isDirty, orphanIds, selectVisible, toggleSede,
} from './permissions-logic'
import { ui } from './ui'

// Permisos por Sedes: se busca a un usuario de la intranet y se marcan las sedes sobre las que puede crear sorteos.
// Los usuarios y las sedes se leen en vivo de la intranet; solo los permisos se guardan en el módulo.
const LotteryPerm = () => {
  const [sedes, setSedes] = useState([])
  const [sedesError, setSedesError] = useState('')
  const [query, setQuery] = useState('')
  const [found, setFound] = useState({ users: [], truncated: false })
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [user, setUser] = useState(null)
  const [original, setOriginal] = useState([])
  const [selected, setSelected] = useState([])
  const [filter, setFilter] = useState('')
  const [loadingUser, setLoadingUser] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const dirty = user !== null && isDirty(original, selected)
  const orphans = user ? orphanIds(original, sedes) : []
  const visible = filterSedes(sedes, filter)

  useEffect(() => {
    api.sedesIntranet().then(setSedes).catch((e) => setSedesError(e.message))
  }, [])

  // Búsqueda con espera de 300 ms; una respuesta lenta de una búsqueda anterior no pisa la actual.
  useEffect(() => {
    if (!canSearch(query)) return undefined
    let stale = false
    const timer = setTimeout(() => {
      api.buscarUsuarios(query.trim())
        .then((res) => !stale && setFound(res))
        .catch((e) => !stale && setSearchError(e.message))
        .finally(() => !stale && setSearching(false))
    }, 300)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [query])

  const onQueryChange = (value) => {
    setQuery(value)
    setSearchError('')
    setSearching(canSearch(value))
    if (!canSearch(value)) setFound({ users: [], truncated: false })
  }

  // Avisa si se intenta cerrar la pestaña con cambios sin guardar.
  useEffect(() => {
    if (!dirty) return undefined
    const warn = (e) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const pick = async (u) => {
    if (dirty && !window.confirm('Hay cambios sin guardar. ¿Descartarlos y cambiar de usuario?')) return
    setError('')
    setMessage('')
    setLoadingUser(true)
    try {
      const res = await api.permisosDeUsuario(u.id)
      setUser(res.user)
      setOriginal(res.sedeIds)
      setSelected(res.sedeIds)
      setFilter('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoadingUser(false)
    }
  }

  const save = async () => {
    setError('')
    setMessage('')
    setSaving(true)
    try {
      const res = await api.guardarPermisos(user.id, idsToSave(selected, sedes))
      setOriginal(res.sedeIds)
      setSelected(res.sedeIds)
      setMessage(`Permisos guardados para ${user.fullName}: ${res.added} sedes agregadas y ${res.removed} quitadas.`)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const discard = () => {
    setSelected(original)
    setError('')
    setMessage('')
  }

  return (
    <>
      <div className={ui.card}>
        <h2 className={ui.title}>1. Buscar usuario de la intranet</h2>
        <label className={ui.field}>
          Nombre, apellido o correo
          <input
            className={ui.input}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Escriba al menos 2 letras"
            autoComplete="off"
          />
        </label>
        {searching && <p className={ui.hint} aria-live="polite">Buscando…</p>}
        {searchError && <p className={ui.error}>{searchError}</p>}
        {!searching && !searchError && canSearch(query) && found.users.length === 0 && (
          <p className={ui.hint}>No hay usuarios activos que coincidan con la búsqueda.</p>
        )}
        {found.users.length > 0 && (
          <ul className="mt-3 max-h-64 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200">
            {found.users.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => pick(u)}
                  disabled={loadingUser}
                  className={`flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-sky-50 disabled:opacity-50 ${
                    user?.id === u.id ? 'bg-sky-50' : ''
                  }`}
                >
                  <span className="font-medium text-gray-800">{u.fullName}</span>
                  <span className="text-gray-600">{u.email}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {found.truncated && <p className={ui.hint}>Hay más resultados: escriba más letras para acotar la búsqueda.</p>}
      </div>

      {error && <p className={ui.error} role="alert">{error}</p>}

      {user && (
        <div className={ui.card}>
          <h2 className={ui.title}>2. Sedes de {user.fullName}</h2>
          <p className={ui.hint}>{user.email}</p>
          {!user.active && <p className={ui.error}>Este usuario está inactivo en la intranet.</p>}
          {sedesError && <p className={ui.error}>{sedesError}</p>}

          <div className={ui.toolbar}>
            <input
              className={ui.input}
              aria-label="Filtrar sedes"
              placeholder="Filtrar sedes…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <button type="button" className={ui.btnOutline} onClick={() => setSelected(selectVisible(selected, visible))}>
              Marcar las visibles
            </button>
            <button type="button" className={ui.btnOutline} onClick={() => setSelected(clearVisible(selected, visible))}>
              Quitar las visibles
            </button>
            <span className={ui.hint}>{selected.length} de {sedes.length} sedes marcadas</span>
          </div>

          {visible.length === 0 && <p className={ui.hint}>No hay sedes que coincidan con el filtro.</p>}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((s) => {
              const on = selected.includes(s.idSede)
              const locked = !s.active && !on // una sede inactiva no se puede asignar de nuevo
              return (
                <label
                  key={s.idSede}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                    locked ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400' : 'cursor-pointer'
                  } ${on ? 'border-primary bg-sky-50 text-gray-800' : 'border-gray-300 bg-white text-gray-800'}`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={locked}
                    onChange={() => setSelected(toggleSede(selected, s))}
                  />
                  <span>{s.name}</span>
                  {!s.active && <span className="ml-auto text-xs text-gray-500">inactiva</span>}
                </label>
              )
            })}
          </div>

          {orphans.length > 0 && (
            <p className={ui.hint}>
              {orphans.length === 1 ? 'Una sede asignada ya no existe' : `${orphans.length} sedes asignadas ya no existen`} en
              la intranet y se quitarán al guardar.
            </p>
          )}

          <div className={ui.toolbar}>
            <button type="button" className={ui.btnPrimary} onClick={save} disabled={saving || (!dirty && orphans.length === 0)}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
            <button type="button" className={ui.btnOutline} onClick={discard} disabled={saving || !dirty}>
              Descartar cambios
            </button>
            {dirty && <span className={ui.hint}>Hay cambios sin guardar.</span>}
          </div>
          {message && <p className={ui.success} aria-live="polite">{message}</p>}
        </div>
      )}
    </>
  )
}

export default LotteryPerm
