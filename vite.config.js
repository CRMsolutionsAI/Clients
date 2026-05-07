import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Base берётся из переменной окружения (задаётся в deploy.yml)
  base: process.env.VITE_BASE || '/client-page/',
})
