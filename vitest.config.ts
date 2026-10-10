import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src'), 'server-only': path.resolve(__dirname, 'evals/server-only-stub.ts') } },
  test: { include: ['src/**/*.test.ts', 'evals/**/*.eval.ts'], environment: 'node' },
});
