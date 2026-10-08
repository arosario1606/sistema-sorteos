import { createFileRoute, redirect } from '@tanstack/react-router'

// SOLO DESARROLLO: la intranet tiene su propia página de inicio.
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/lotteryreg' })
  },
})
