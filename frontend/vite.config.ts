import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The app always calls the API with relative URLs (/api/...). In development the
// Vite server forwards them to the .NET backend; in Docker the backend serves the
// built app from the same origin, so no proxy is needed there.
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:5010'

const proxy = {
  '/api': { target: apiTarget },
  '/health': { target: apiTarget },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,
    proxy,
  },
  preview: {
    port: 3000,
    strictPort: true,
    proxy,
  },
})
