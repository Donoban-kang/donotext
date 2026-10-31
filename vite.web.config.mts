import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Renderer-only dev server used for browser-mode verification (window.api is mocked).
export default defineConfig({
  root: 'src/renderer',
  plugins: [react()],
  server: { port: 5173, strictPort: true }
})
