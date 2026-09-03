import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// base は相対パスにしてある。GitHub Pages のプロジェクトページ
// (https://<user>.github.io/<repo>/) でもリポジトリ名を設定に埋め込まずに動く。
// ルーティングは HashRouter を使うので、Pages 側の 404 リライト設定も不要。
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    // apache-arrow / duckdb-wasm が BigInt リテラルと top-level await を使うため
    target: 'esnext',
    chunkSizeWarningLimit: 2000,
  },
});
