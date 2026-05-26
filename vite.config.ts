import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { writeFileSync, mkdirSync, existsSync } from 'fs'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'vite-port-file',
      configureServer(server) {
        server.httpServer?.once('listening', () => {
          const addr = server.httpServer?.address()
          const port = typeof addr === 'object' && addr ? addr.port : 29348
          const tmpDir = path.resolve(__dirname, '.vite')
          if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true })
          writeFileSync(path.join(tmpDir, 'port'), String(port))
          console.log(`[vite] 端口已写入 .vite/port → ${port}`)
        })
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'vendor-react'
          if (id.includes('src/components/Collector/')) return 'views-collector'
          if (id.includes('src/components/Workshop/')) return 'views-workshop'
        },
      },
    },
  },
  server: {
    port: Number(process.env.VITE_DEV_PORT) || 29348,
    strictPort: false,
  }
})
