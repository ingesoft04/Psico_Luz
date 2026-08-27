const js = require('@eslint/js');

module.exports = [
  {
    ignores: ['node_modules/**', 'tmp/**', 'output/**'],
  },
  {
    ...js.configs.recommended,
    files: ['src/**/*.js'],
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        Buffer: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        module: 'readonly',
        process: 'readonly',
        require: 'readonly',
        setTimeout: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];
