import js from '@eslint/js';

export default [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                console: 'readonly',
                process: 'readonly',
                Buffer: 'readonly',
                setTimeout: 'readonly',
                setInterval: 'readonly',
                clearTimeout: 'readonly',
                clearInterval: 'readonly',
                global: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                fetch: 'readonly',
                URLSearchParams: 'readonly',
                URL: 'readonly'
            }
        },
        rules: {
            'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            'no-console': 'warn',
            'prefer-const': 'error',
            'no-var': 'error',
            'eqeqeq': ['error', 'always'],
            'curly': ['error', 'all'],
            'semi': ['error', 'always'],
            'quotes': ['error', 'single'],
            'indent': ['error', 4],
            'comma-dangle': ['error', 'never'],
            'object-curly-spacing': ['error', 'always'],
            'array-bracket-spacing': ['error', 'never'],
            'key-spacing': ['error', { beforeColon: false, afterColon: true }],
            'space-before-function-paren': ['error', 'never'],
            'space-in-parens': ['error', 'never'],
            'keyword-spacing': ['error', { before: true, after: true }],
            'brace-style': ['error', '1tbs', { allowSingleLine: true }]
        },
        ignores: [
            'node_modules/',
            'data/',
            'bot/',
            'tests/mocks/',
            'coverage/'
        ]
    }
];