import { createFileRoute, Link, Outlet } from '@tanstack/react-router'

const LINKS = [
  { to: '/lotteryreg', label: 'Registrar sorteo' },
  { to: '/listassist', label: 'Listar asistencia' },
  { to: '/execlottery', label: 'Ejecutar sorteo' },
]

// SOLO DESARROLLO: simula el layout de la intranet (src/routes/_content.jsx + Content).
// Al integrar NO se copia este archivo: se usa el de la intranet.
function DevLayout() {
  return (
    <>
      <header className="flex flex-wrap items-center gap-4 bg-white px-6 py-3 shadow-xl">
        <span className="font-semibold text-primary">Sorteos (modo desarrollo)</span>
        <nav className="flex gap-2">
          {LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-sky-50"
              activeProps={{ className: 'bg-primary text-white hover:bg-primary' }}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl p-4 sm:p-6">
        <Outlet />
      </main>
    </>
  )
}

export const Route = createFileRoute('/_content')({
  component: DevLayout,
})
