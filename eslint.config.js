import js from '@eslint/js'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'

export default [
  {
    ignores: [
      'dist-deploy/**',
      'node_modules/**',
      'prototypes/**',
      '.playwright-mcp/**',
      '.husky/**',
      'public/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/no-unknown-property': [
        'error',
        {
          // R3F and Three.js props look custom to ESLint; allow the ones we use.
          ignore: [
            'args',
            'attach',
            'object',
            'dispose',
            'shadow-farScale',
            'localWeatherVelocity',
            'correctAltitude',
            'maxAltitude',
            'enableDamping',
            'adjustHeight',
            'correctGeometricError',
            'albedoScale',
            'sky',
            'sunLight',
            'skyLight',
            'qualityPreset',
          ],
        },
      ],
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          // catch (e) {} for swallow-all-errors is a deliberate pattern
          // throughout this codebase (localStorage quota, JSON parse, etc.).
          caughtErrors: 'none',
        },
      ],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['**/__tests__/**/*.{js,jsx}', '**/*.test.{js,jsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        vi: 'readonly',
      },
    },
  },
  {
    files: ['scripts/**/*.js'],
    languageOptions: { globals: { ...globals.node } },
  },
]
