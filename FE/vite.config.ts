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
    alias: [
      // '@/...' 경로를 'src/...'로 매핑한다.
      { find: '@', replacement: resolve(__dirname, './src') },
      // 구체적인 서브패스를 먼저 선언해야 한다. object 형태의 alias는 삽입 순서대로 prefix 매칭되므로
      // 'three'가 먼저 오면 'three/webgpu'도 'three'로 prefix 매칭되어 해석에 실패한다.
      // @thatopen/components가 three/webgpu, three/tsl 서브패스를 import할 때
      // 직접 빌드 파일 경로로 매핑해 Vite import-analysis 단계의 해석 실패를 방지한다.
      { find: 'three/webgpu', replacement: resolve(__dirname, 'node_modules/three/build/three.webgpu.js') },
      { find: 'three/tsl', replacement: resolve(__dirname, 'node_modules/three/build/three.tsl.js') },
      // three를 명시적으로 단일 경로로 고정해 @thatopen/components의 별도 로드를 차단한다.
      { find: 'three', replacement: resolve(__dirname, 'node_modules/three') },
    ],
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
    // three를 명시적으로 포함해 사전 번들링된 단일 인스턴스를 보장한다.
    include: ['three'],
  },
})
