import { ui } from './ui'

const MIN_ROWS = 10 // ganadores por columna
const MAX_COLUMNS = 6
const COLUMN_GAP_REM = 0.75

// Filas por columna: 10 normalmente; si hay más de 60 ganadores crece para no pasar de 6 columnas.
const rowsPerColumn = (count) => Math.max(MIN_ROWS, Math.ceil(count / MAX_COLUMNS))

// Todos los ganadores a la vez, sin scroll: columnas que se llenan de arriba abajo y luego hacia la derecha,
// en orden de salida. Solo número, nombre y gerencia (la cédula no se muestra en pantalla grande).
// Las columnas tienen un ancho propio (no se reparten toda la pantalla) y el bloque va centrado: una sola columna
// queda al centro y varias se agrupan en el medio.
export default function WinnersGrid({ winners, latestOrder, presenting }) {
  const rows = rowsPerColumn(winners.length)
  const columns = Math.ceil(winners.length / rows)
  // En pantalla completa el texto crece con el alto disponible. Con 4 o más columnas cada una es angosta y los
  // nombres largos pasan a dos líneas, así que la letra se reduce para que ambas líneas y la gerencia quepan.
  const lineFactor = columns <= 3 ? 2.4 : 3.3
  // Ancho de columna: hasta 22em (crece con la letra) o, si no caben, el reparto equitativo del ancho disponible.
  const columnWidth = `min(22em, calc((100% - ${(columns - 1) * COLUMN_GAP_REM}rem) / ${columns}))`
  const fontSize = presenting ? `clamp(0.85rem, calc((100vh - 15rem) / ${rows} / ${lineFactor}), 2rem)` : undefined

  if (winners.length === 0) {
    return <p className={`${ui.hint} py-6 text-center`}>Aún no hay ganadores</p>
  }

  return (
    <ol
      aria-label="Ganadores"
      className={`grid ${presenting ? 'h-full' : ''}`}
      style={{
        gridAutoFlow: 'column',
        gridAutoColumns: columnWidth,
        justifyContent: 'center',
        columnGap: `${COLUMN_GAP_REM}rem`,
        rowGap: '0.25rem',
        gridTemplateRows: `repeat(${rows}, minmax(${presenting ? 0 : '2.75rem'}, 1fr))`,
        fontSize,
      }}
    >
      {winners.map((w) => (
        <li
          key={w.winningOrder}
          className={`flex min-w-0 items-center gap-2 rounded-md border px-2 ${
            latestOrder === w.winningOrder ? 'border-accent bg-green-50' : 'border-gray-200 bg-white'
          }`}
        >
          <span className="flex h-[1.9em] min-w-[1.9em] shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[0.8em] font-bold text-white">
            {w.winningOrder}
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block line-clamp-2 break-words font-semibold text-gray-800" title={`${w.names} ${w.lastName}`}>
              {w.names} {w.lastName}
            </span>
            <span className="block truncate text-[0.62em] text-gray-600">{w.department}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}
