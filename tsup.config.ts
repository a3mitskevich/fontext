import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  tsconfig: './tsconfig.lib.json',
  dts: true,
  format: ['cjs', 'esm'],
  shims: true,
  clean: true
})
