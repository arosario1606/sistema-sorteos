import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // El backend corre en el puerto 3000 (ver backend/.env)
    proxy: { '/api': 'http://localhost:3000' },
  },
})
