import { createRootRoute, Outlet } from '@tanstack/react-router'

// SOLO DESARROLLO: en la intranet el root, el login y el layout son los de la propia intranet.
export const Route = createRootRoute({
  component: () => <Outlet />,
})
