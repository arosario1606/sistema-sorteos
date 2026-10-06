import { ui } from './ui'

// Resumen de una carga de CSV con el detalle de las filas rechazadas.
export default function UploadResult({ result, summary }) {
  if (!result) return null
  return (
    <div className="mt-2 rounded-md bg-sky-50 p-3">
      <p className={ui.success}>{summary(result)}</p>
      {result.errors.length > 0 && (
        <details open>
          <summary className="cursor-pointer text-sm font-medium text-red-600">
            {result.errors.length} fila(s) con error (no se cargaron)
          </summary>
          <ul className="mt-1 list-disc pl-5 text-sm text-gray-600">
            {result.errors.map((e) => (
              <li key={`${e.line}-${e.reason}`}>
                Línea {e.line}
                {e.cedula ? ` (${e.cedula})` : ''}: {e.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
