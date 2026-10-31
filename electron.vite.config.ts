import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { CSP } from './src/shared/csp'

// Packaged builds load index.html over file://, where response headers do not
// apply, so the CSP is embedded as a <meta> tag for production builds only.
const cspMeta = (): Plugin => ({
  name: 'donotext-csp-meta',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`)
})

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    root: 'src/renderer',
    plugins: [react(), cspMeta()]
  }
})
