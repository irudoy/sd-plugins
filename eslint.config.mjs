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
    // Browser JS (Property Inspector) - uses export {} for TypeScript module isolation
    files: [
      '**/driveinfo/**/*.js',
      '**/battery/**/*.js',
      '**/osascript/**/*.js',
      '**/vpn/**/*.js',
      '**/light/**/*.js',
      '**/switch/**/*.js',
      '**/outlet/**/*.js',
      '**/lock/**/*.js',
      '**/cover/**/*.js',
      '**/thermostat/**/*.js',
      '**/sensor/**/*.js',
      '**/button/**/*.js',
      '**/scenario/**/*.js',
      '**/speakers/**/*.js',
      '**/output/**/*.js',
      '**/mixer/**/*.js',
      '**/preset/**/*.js',
      '**/pi-lib/**/*.js',
    ],
    languageOptions: {
      sourceType: 'module',
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
        // Shared PI libraries
        SprutHubPI: 'readonly',
        AControlPI: 'readonly',
        AntelopePI: 'readonly',
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
