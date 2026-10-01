// Cliente mínimo de la API. En desarrollo Vite redirige /api al backend.
// Cuando se integre la intranet, aquí se agregará el token de autenticación.
async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, options)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(body.error || `Error ${res.status}`)
    err.status = res.status
    err.body = body
    throw err
  }
  return body
}

const json = (method, data) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
})

const upload = (file) => {
  const form = new FormData()
  form.append('archivo', file)
  return { method: 'POST', body: form }
}

export const api = {
  me: () => request('/me'),
  sorteos: () => request('/sorteos'),
  sorteo: (id) => request(`/sorteos/${id}`),
  crearSorteo: (data) => request('/sorteos', json('POST', data)),
  subirParticipantes: (id, file) => request(`/sorteos/${id}/participantes`, upload(file)),
  subirCupos: (id, file) => request(`/sorteos/${id}/cupos`, upload(file)),
  asistencia: (id) => request(`/sorteos/${id}/asistencia`),
  marcarAsistencia: (id, idParticipant, attended) =>
    request(`/sorteos/${id}/asistencia/${idParticipant}`, json('PATCH', { attended })),
  ejecutar: (id) => request(`/sorteos/${id}/ejecutar`, { method: 'POST' }),
  ganadores: (id) => request(`/sorteos/${id}/ganadores`),
}

export const formatDate = (iso) =>
  new Date(iso).toLocaleDateString('es-VE', { timeZone: 'UTC' })
