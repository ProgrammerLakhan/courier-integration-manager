// @ts-check
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  // ─── Global ignores ────────────────────────────────────────
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      '*.js',          // this file itself + any JS config files
      '*.mjs',
    ],
  },

  // ─── Base recommended rules ─────────────────────────────────
  ...tseslint.configs.recommended,

  // ─── Project-wide TS settings ───────────────────────────────
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      // ── Errors (break the build) ──────────────────────────
      'no-console': 'error',          // use logger, not console
      'eqeqeq': ['error', 'always'],
      'prefer-const': 'error',
      'no-var': 'error',
      'no-duplicate-imports': 'error',

      '@typescript-eslint/no-floating-promises': 'error',  // catch unhandled async
      '@typescript-eslint/await-thenable': 'error',  // no await on non-thenables
      '@typescript-eslint/no-misused-promises': 'error',  // promise in boolean context
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/require-await': 'error',  // async fn must have await

      // ── Warnings (report but don't break CI) ─────────────
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],

      // ── Relaxed / Off ─────────────────────────────────────
      // TypeORM requires property initializers on entities
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Express middleware pattern passes _next even when unused
      '@typescript-eslint/no-unused-expressions': 'off',
      // Decorators emit metadata — emitDecoratorMetadata patterns are fine
      '@typescript-eslint/ban-types': 'off',
    },
  },
);
