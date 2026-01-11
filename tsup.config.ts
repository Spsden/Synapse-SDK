import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['iife', 'cjs', 'esm'],
    globalName: 'SynapseSDK',
    outDir: 'dist',
    clean: true,
    dts: true,
    minify: false, // Keep it readable for now
    sourcemap: true,
});
