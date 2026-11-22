import js from '@eslint/js';
import globals from 'globals';

export default [
    js.configs.recommended,
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {...globals.node},
        },
        rules: {
            'no-unused-vars': ['error', {args: 'none', caughtErrors: 'none'}],
        },
    },
    {
        files: ['**/*.cjs'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {...globals.node},
        },
    },
    {
        ignores: ['node_modules/', 'coverage/'],
    },
];
