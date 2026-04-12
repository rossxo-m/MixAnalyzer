import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: mode === 'singlefile' ? [react(), viteSingleFile()] : [react()],
  base: mode === 'singlefile' ? './' : '/MixAnalyzer/',
}))
