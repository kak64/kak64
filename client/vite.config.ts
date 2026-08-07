import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // חושף את שרת הפיתוח לרשת המקומית (LAN) כדי לבדוק מהטלפון:
    // Vite ידפיס גם כתובת "Network" בצורת http://<IP-של-המחשב>:5173
    host: true,
    // בזמן פיתוח: כל בקשה ל-/api מנותבת אוטומטית לשרת ה-Express על 4000
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
