export default {
    createOldCatalogs: false,
    defaultNamespace: 'common',
    indentation: 4,
    input: ['src/**/*.{ts,tsx}'],
    keepRemoved: false,
    keySeparator: '.',
    locales: ['en-US', 'es-ES', 'de'],
    namespaceSeparator: ':',
    output: 'tmp/i18next-extract/$LOCALE/$NAMESPACE.json',
    sort: true,
    verbose: false
};
