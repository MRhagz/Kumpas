import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
const file = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({ root: file('./'), define: { 'process.env': '{}' }, resolve: { alias: [
  { find: 'next/link', replacement: file('./link.tsx') },
  { find: 'next/navigation', replacement: file('./navigation.ts') },
  { find: '@/components/auth/protected-header', replacement: file('./empty.tsx') },
  { find: '@', replacement: file('../../src') },
]}, server: { host: '127.0.0.1', port: 4176, fs: { allow: [file('../../')] } } });
