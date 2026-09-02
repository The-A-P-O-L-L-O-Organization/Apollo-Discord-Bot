import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/**/*.test.{js,ts}'],
        exclude: ['tests/mocks/**', 'node_modules/**', 'dist/**'],
        setupFiles: ['./tests/setup.js'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'src/index.ts',
                'src/handlers/**',
                'tests/**',
                'src/**/*.test.{js,ts}',
                'bin/**',
                'scripts/**',
                'dist/**'
            ]
        },
        testTimeout: 30000,
        hookTimeout: 30000,
        teardownTimeout: 10000,
        isolate: true,
        pool: 'forks',
        poolOptions: {
            forks: {
                singleFork: true
            }
        }
    },
    resolve: {
        alias: {
            '@core': path.resolve(__dirname, 'src/core'),
            '@utils': path.resolve(__dirname, 'src/utils'),
            '@plugins': path.resolve(__dirname, 'src/plugins'),
            '@queue': path.resolve(__dirname, 'src/queue'),
            '@db': path.resolve(__dirname, 'src/db'),
            '@config': path.resolve(__dirname, 'src/config/config'),
            '@types': path.resolve(__dirname, 'src/types')
        }
    }
});