import js from '@eslint/js';
import typescriptEslint from 'typescript-eslint';
import vitestPlugin from 'eslint-plugin-vitest';

export default [
    { ignores: ['dist/**', 'data/**', 'node_modules/**', 'tests/mocks/**', 'src/handlers/**', 'eslint.config.js', 'vitest.config.ts', '*.md', 'tests/**', 'bin/**', 'scripts/**'] },
    ...typescriptEslint.configs.recommendedTypeChecked,
    ...typescriptEslint.configs.stylisticTypeChecked,
    vitestPlugin.configs.recommended,
    {
        files: ['src/**/*.ts'],
        languageOptions: {
            parserOptions: {
                project: ['./tsconfig.json', './tsconfig.build.json', './tsconfig.test.json'],
                tsconfigRootDir: import.meta.dirname,
                sourceType: 'module',
                ecmaVersion: 'latest'
            }
        },
        rules: {
            'eqeqeq': ['error', 'always', { null: 'ignore' }],
            'curly': ['error', 'all'],
            'no-trailing-spaces': 'error',
            'comma-dangle': ['error', 'never'],
            'quotes': ['error', 'single'],
            'semi': ['error', 'always'],
            'indent': ['error', 4],
            'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            'no-console': ['warn', { allow: ['warn', 'error'] }],
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unsafe-assignment': 'warn',
            '@typescript-eslint/no-unsafe-member-access': 'warn',
            '@typescript-eslint/no-unsafe-call': 'warn',
            '@typescript-eslint/no-unsafe-return': 'warn',
            '@typescript-eslint/no-floating-promises': 'warn',
            '@typescript-eslint/consistent-type-imports': 'error',
            '@typescript-eslint/consistent-type-exports': 'error',
            'vitest/expect-expect': 'error',
            'vitest/no-disabled-tests': 'warn',
            'vitest/no-focused-tests': 'error'
        }
    },
    {
        files: ['src/handlers/**/*.ts'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-call': 'off',
            '@typescript-eslint/no-unsafe-return': 'off',
            '@typescript-eslint/no-floating-promises': 'off',
            '@typescript-eslint/consistent-type-imports': 'off',
            '@typescript-eslint/consistent-type-exports': 'off'
        }
    }
];