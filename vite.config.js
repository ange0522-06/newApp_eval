import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  const API_KEY = env.VITE_PS_API_KEY

  return {
    plugins: [
      vue(),
      vueDevTools(),
    ],
    server: {
      proxy: {
        '/newapp-api': {
          target: 'http://localhost',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace('/newapp-api', '/e-commerce/newApp/api'),
        },
        '/prestashop-api': {
          target: 'http://localhost',   // ← http au lieu de https
          changeOrigin: true,
          secure: false,                 // ← ignore le certificat auto-signé XAMPP
          rewrite: (path) => {
            const newPath = path.replace('/prestashop-api', '/e-commerce/eval')
            const separator = newPath.includes('?') ? '&' : '?'
            return `${newPath}${separator}ws_key=${API_KEY}`
          },
          headers: {
            'Authorization': ''
          }
        },
      },
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      },
    },
  }
})
