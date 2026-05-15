import { defineConfig, splitVendorChunkPlugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [
    react(),
    // 벤더 청크를 분리해 초기 번들 크기를 줄인다.
    splitVendorChunkPlugin(),
    {
      name: 'batang-fragments-worker-mime',
      configureServer(server) {
        server.middlewares.use('/fragments-worker.mjs', (_req, res) => {
          res.statusCode = 200
          res.setHeader('Content-Type', 'text/javascript; charset=utf-8')
          res.end(readFileSync(resolve(__dirname, './public/fragments-worker.mjs')))
        })
      },
      configurePreviewServer(server) {
        server.middlewares.use('/fragments-worker.mjs', (_req, res) => {
          res.statusCode = 200
          res.setHeader('Content-Type', 'text/javascript; charset=utf-8')
          res.end(readFileSync(resolve(__dirname, './public/fragments-worker.mjs')))
        })
      },
    },
  ],
  resolve: {
    alias: {
      // '@/...' 경로를 'src/...'로 매핑한다.
      '@': resolve(__dirname, './src'),
    },
    // @thatopen/components가 별도 번들로 로드될 때 Three.js 인스턴스가
    // 중복 생성되면 씬 공유가 깨지므로 반드시 단일 인스턴스를 강제한다.
    dedupe: ['three'],
  },
  server: {
    proxy: {
      // 개발 서버에서 API 요청을 백엔드로 프록시한다.
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    // @thatopen/components는 런타임 동적 import를 사용하므로 사전 번들링에서 제외한다.
    exclude: ['@thatopen/components'],
  },
})
