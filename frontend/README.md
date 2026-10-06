# Frontend de Sorteos

React 18 + Vite + Tailwind 3 + TanStack Router (file-based), con la misma pila y convenciones que `intranet-frontend`
para poder integrarse copiando carpetas (ver `docs/integracion/INTEGRACION.md`).

```
src/components/main/content/lottery/   ← LO QUE SE LLEVA A LA INTRANET (pantallas, cliente de API, estilos compartidos)
src/routes/_content/*.jsx              ← rutas de las 3 pantallas (/lotteryreg, /listassist, /execlottery)
src/routes/{__root,_content,index}.jsx ← SOLO DESARROLLO: layout que imita a la intranet; no se copia
```

Desarrollo: `cp .env.example .env.local`, pegar `DEV_AUTH_TOKEN` (`npm run dev:token` en `backend/`) y `npm run dev`
(http://localhost:5173; Vite reenvía `/apiv1/lottery-service` al backend y le agrega `x-auth-token` como lo hace el gateway).
