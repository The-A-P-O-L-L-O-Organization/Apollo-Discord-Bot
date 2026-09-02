import js from '@eslint/js';
import typescriptEslint from 'typescript-eslint';
import vitestPlugin from 'eslint-plugin-vitest';

export default typescriptEslint.config(
    { ignores: ['dist/**', 'data/**', 'node_modules/**', 'tests/mocks/**', 'src/handlers/**', 'eslint.config.js', 'vitest.config.ts', '*.md'] },
    ...typescriptEslint.configs.recommendedTypeChecked,
    ...typescriptEslint.configs.stylisticTypeChecked,
    ...vitestPlugin.configs.recommended,
    {
        files: ['**/*.ts'],
        languageOptions: {
            parserOptions: {
                projectService: true,
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
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/no-unsafe-assignment': 'error',
            '@typescript-eslint/no-unsafe-member-access': 'error',
            '@typescript-eslint/no-unsafe-call': 'error',
            '@typescript-eslint/no-unsafe-return': 'error',
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/await-thenable': 'error',
            '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
            '@typescript-eslint/consistent-type-imports': 'error',
            '@typescript-eslint/consistent-type-exports': 'error',
            '@typescript-eslint/no-unnecessary-condition': 'error',
            '@typescript-eslint/prefer-nullish-coalescing': 'error',
            'vitest/expect-expect': 'error',
            'vitest/no-disabled-tests': 'warn',
            'vitest/no-focused-tests': 'error'
        }
    },
    {
        files: ['tests/**/*.ts'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-call': 'off',
            '@typescript-eslint/no-unsafe-return': 'off',
            '@typescript-eslint/no-floating-promises': 'off',
            '@typescript-eslint/await-thenable': 'off',
            '@typescript-eslint/no-misused-promises': 'off',
            '@typescript-eslint/no-unnecessary-condition': 'off',
            '@typescript-eslint/prefer-nullish-coalescing': 'off'
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
            '@typescript-eslint/await-thenable': 'off',
            '@typescript-eslint/no-misused-promises': 'off',
            '@typescript-eslint/no-unnecessary-condition': 'off',
            '@typescript-eslint/prefer-nullish-coalescing': 'off'
        }
    }
);