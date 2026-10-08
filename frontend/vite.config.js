import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      TanStackRouterVite({
        routesDirectory: './src/routes',
        generatedRouteTree: './src/routeTree.gen.js',
        autoCodeSplitting: true,
        disableTypes: true,
      }),
      react(),
    ],
    server: {
      // Imita al gateway de la intranet: /apiv1/lottery-service/* -> backend, con x-auth-token.
      // En la intranet real ese header lo firma el gateway; aquí sale de DEV_AUTH_TOKEN (npm run dev:token).
      proxy: {
        '/apiv1/lottery-service': {
          target: env.BACKEND_URL || 'http://localhost:3000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/apiv1\/lottery-service/, ''),
          headers: env.DEV_AUTH_TOKEN ? { 'x-auth-token': env.DEV_AUTH_TOKEN } : {},
        },
      },
    },
  }
})
