import Cookies from 'js-cookie'

// El navegador solo habla con el gateway de la intranet (mismo origen, cookie access_token).
// El gateway valida sesión y permisos y reenvía la petición al servicio de sorteos.
const BASE = `${import.meta.env.VITE_LOTTERY_API_BASE || '/apiv1/lottery-service'}/api/lottery`

// Sin sesión válida el gateway redirige a "/": el fetch sigue la redirección y llega HTML, no JSON.
function sessionExpired() {
  if (import.meta.env.DEV) {
    throw new Error('Sin sesión: falta o venció DEV_AUTH_TOKEN en frontend/.env.local (npm run dev:token en backend)')
  }
  Cookies.remove('access_token')
  localStorage.clear()
  window.location.href = '/'
  throw new Error('Sesión expirada. Por favor, inicie sesión de nuevo.')
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, { credentials: 'same-origin', ...options })
  const isJson = res.headers.get('content-type')?.includes('application/json')
  if (res.status === 401 || (res.redirected && !isJson)) sessionExpired()

  const body = isJson ? await res.json().catch(() => ({})) : {}
  if (!res.ok) {
    // El servicio responde { error }; el gateway responde { msg } cuando deniega el acceso.
    const err = new Error(body.error || body.msg || body.message || `Error ${res.status}`)
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
  sorteo: (id) => request(`/sorteos/detail?id=${id}`),
  crearSorteo: (data) => request('/sorteos/create', json('POST', data)),
  subirParticipantes: (id, file) => request(`/participants/upload?id=${id}`, upload(file)),
  subirCupos: (id, file) => request(`/quotas/upload?id=${id}`, upload(file)),
  asistencia: (id) => request(`/attendance/list?id=${id}`),
  marcarAsistencia: (idSorteos, idParticipant, attended) =>
    request('/attendance/mark', json('POST', { idSorteos, idParticipant, attended })),
  ejecutar: (id) => request(`/draw/execute?id=${id}`, { method: 'POST' }),
  ganadores: (id) => request(`/draw/winners?id=${id}`),
}

export const formatDate = (iso) =>
  new Date(iso).toLocaleDateString('es-VE', { timeZone: 'UTC' })
