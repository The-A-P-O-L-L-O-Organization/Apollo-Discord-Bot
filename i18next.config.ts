import { defineConfig } from 'i18next-cli';

export default defineConfig({
    locales: [
        'en-US',
        'es-ES',
        'de'
    ],
    extract: {
        input: [
            'src/**/*.{ts,tsx}'
        ],
        output: 'tmp/i18next-extract/{{language}}/{{namespace}}.json',
        defaultNS: 'common',
        keySeparator: '.',
        nsSeparator: ':',
        functions: [
            't',
            '*.t'
        ],
        transComponents: [
            'Trans'
        ],
        indentation: 4,
        sort: true
    }
});
