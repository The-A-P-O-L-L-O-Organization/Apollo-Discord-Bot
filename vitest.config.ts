import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/**/*.test.{js,ts}'],
        exclude: ['tests/mocks/**', 'node_modules/**', 'dist/**'],
        setupFiles: ['./tests/setup.ts'],
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
        maxWorkers: 1,
        fileParallelism: false
    }
});
