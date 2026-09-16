import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Netlify sets these at build time. Both Supabase values are public by design —
// the browser needs them to sign in. The service-role key is never read here.
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: true },
  server: { port: 5173 },
});
