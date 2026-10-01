import { useState } from 'react'
import RegistrarSorteo from './pages/RegistrarSorteo'
import Asistencia from './pages/Asistencia'
import EjecutarSorteo from './pages/EjecutarSorteo'

const PAGES = [
  { id: 'registrar', label: 'Registrar sorteo', Component: RegistrarSorteo },
  { id: 'asistencia', label: 'Listar asistencia', Component: Asistencia },
  { id: 'ejecutar', label: 'Ejecutar sorteo', Component: EjecutarSorteo },
]

export default function App() {
  const [page, setPage] = useState('registrar')
  const { Component } = PAGES.find((p) => p.id === page)

  return (
    <>
      <header className="topbar">
        <h1>Sistema de Sorteos</h1>
        <nav>
          {PAGES.map((p) => (
            <button key={p.id} className={p.id === page ? 'active' : ''} onClick={() => setPage(p.id)}>
              {p.label}
            </button>
          ))}
        </nav>
      </header>
      <main>
        <Component />
      </main>
    </>
  )
}
