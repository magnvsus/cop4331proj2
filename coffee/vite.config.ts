import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Shares a single .env with the backend instead of needing one per
  // directory.
  const envDir = path.resolve(__dirname, '..')
  const env = loadEnv(mode, envDir, '')

  return {
    plugins: [react()],
    envDir,
    // Vite only exposes VITE_-prefixed vars to client code (import.meta.env)
    // by default -- API_DOMAIN is shared verbatim with the backend (see
    // mailer.js) so it deliberately isn't prefixed. Explicitly exposing just
    // this one var via `define`, rather than widening `envPrefix` to match
    // "API_", keeps every other backend-only secret in this file
    // (JWT_SECRET, MONGODB_URI, EMAIL_APP_PASSWORD, ...) out of the client
    // bundle -- widening the prefix would auto-expose any future API_*
    // secret too, not just this one.
    define: {
      'import.meta.env.API_DOMAIN': JSON.stringify(env.API_DOMAIN ?? ''),
    },
  }
})
