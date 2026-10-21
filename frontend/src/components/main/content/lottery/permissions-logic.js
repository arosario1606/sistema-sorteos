// Lógica pura de la pantalla «Permisos por Sedes» (sin React, para poder probarla).

// Sin tildes ni mayúsculas, igual que la búsqueda de usuarios del backend.
const ACCENTED = 'áàäâéèëêíìïîóòöôúùüûñÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑ'
const PLAIN = 'aaaaeeeeiiiioooouuuunAAAAEEEEIIIIOOOOUUUUN'
export const fold = (text) =>
  [...String(text ?? '')].map((ch) => PLAIN[ACCENTED.indexOf(ch)] ?? ch).join('').toLowerCase()

export const MIN_QUERY = 2

// ¿Se puede buscar ya? (mismo mínimo que el servicio)
export const canSearch = (query) => fold(query).replace(/\s+/g, ' ').trim().length >= MIN_QUERY

// Sedes cuyo nombre contiene todas las palabras del filtro (en cualquier orden).
export function filterSedes(sedes, filter) {
  const terms = fold(filter).split(/\s+/).filter(Boolean)
  return sedes.filter((s) => terms.every((t) => fold(s.name).includes(t)))
}

const sameSet = (a, b) => a.length === b.length && a.every((id) => b.includes(id))

// ¿Hay cambios sin guardar? `original` = ids guardados; `selected` = ids marcados.
export const isDirty = (original, selected) => !sameSet([...new Set(original)], [...new Set(selected)])

// Ids asignados que ya no existen en la intranet (se quitan al guardar porque la pantalla no los muestra).
export const orphanIds = (original, sedes) => {
  const known = new Set(sedes.map((s) => s.idSede))
  return original.filter((id) => !known.has(id))
}

// Lo que se enviará al guardar: solo sedes que la pantalla conoce.
export const idsToSave = (selected, sedes) => {
  const known = new Set(sedes.map((s) => s.idSede))
  return [...new Set(selected)].filter((id) => known.has(id)).sort((a, b) => a - b)
}

// Marca o desmarca una sede. Una sede inactiva solo se puede desmarcar (el servicio no permite asignarla de nuevo).
export function toggleSede(selected, sede) {
  if (selected.includes(sede.idSede)) return selected.filter((id) => id !== sede.idSede)
  return sede.active ? [...selected, sede.idSede] : selected
}

// Marca todas las sedes activas visibles (conserva lo ya marcado fuera del filtro).
export function selectVisible(selected, visible) {
  const add = visible.filter((s) => s.active).map((s) => s.idSede)
  return [...new Set([...selected, ...add])]
}

// Desmarca todas las sedes visibles (conserva lo marcado fuera del filtro).
export function clearVisible(selected, visible) {
  const drop = new Set(visible.map((s) => s.idSede))
  return selected.filter((id) => !drop.has(id))
}
