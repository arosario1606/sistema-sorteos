// Exportación de ganadores a CSV (se genera en el navegador: no pasa por el servidor ni se guarda en la base).
const BOM = '\uFEFF' // para que Excel reconozca las tildes
// eslint-disable-next-line no-control-regex -- los caracteres de control tampoco valen en nombres de archivo
const INVALID_FILENAME_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g

// "ganadores sorteo <nombre>.csv", quitando los caracteres que Windows no admite en nombres de archivo.
export function winnersFileName(sorteoName) {
  const clean = String(sorteoName ?? '').replace(INVALID_FILENAME_CHARS, '').replace(/\s+/g, ' ').trim().slice(0, 120)
  return `ganadores sorteo ${clean || 'sin nombre'}.csv`
}

// Escapa el valor y neutraliza fórmulas (=, +, -, @) para que Excel no las ejecute.
function cell(value) {
  let text = String(value ?? '')
  if (/^[=+\-@]/.test(text)) text = `'${text}`
  return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function buildWinnersCsv(winners) {
  const header = ['Orden', 'Cédula', 'Nombres', 'Apellidos', 'Cargo', 'Gerencia']
  const rows = winners.map((w) => [w.winningOrder, w.cedula, w.names, w.lastName, w.jobTitle, w.department])
  return `${BOM}${[header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n')}\r\n`
}

export function downloadCsv(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
