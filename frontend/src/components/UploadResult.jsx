// Resumen de una carga de CSV con el detalle de las filas rechazadas.
export default function UploadResult({ result, summary }) {
  if (!result) return null
  return (
    <div className="result">
      <p>{summary(result)}</p>
      {result.errors.length > 0 && (
        <details open>
          <summary>{result.errors.length} fila(s) con error (no se cargaron)</summary>
          <ul>
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
