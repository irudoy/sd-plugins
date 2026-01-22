import js from '@eslint/js';
import prettier from 'eslint-plugin-prettier/recommended';
import globals from 'globals';

export default [
  js.configs.recommended,
  prettier,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-console': 'off',
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    // Browser JS (Property Inspector)
    files: ['**/driveinfo/**/*.js', '**/battery/**/*.js', '**/osascript/**/*.js', '**/vpn/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        ...globals.browser,
        // StreamDock SDK globals
        $: 'readonly',
        $settings: 'readonly',
        $websocket: 'readonly',
        $uuid: 'readonly',
        $propEvent: 'readonly',
        $local: 'readonly',
        $back: 'readonly',
      },
    },
    rules: {
      'no-redeclare': 'off',
      'no-unused-vars': 'off',
    },
  },
  {
    ignores: ['node_modules/**', '**/node_modules/**', '**/static/**', 'old/**', 'reference/**'],
  },
];
