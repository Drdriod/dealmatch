import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'

// Deliberately small: it catches the bugs a build does not (undefined names, broken hook rules),
// which is what caused the isTestMode runtime error in October. Add rules only when they pay for themselves.
export default [
  { linterOptions: { reportUnusedDisableDirectives: 'off' } },
  { ignores: ['dist/**', 'node_modules/**', 'android/**', 'ios/**', 'public/**', 'supabase/**'] },
  {
    files: ['**/*.{js,jsx,mjs}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'no-undef': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
  // Server code logs through src/lib/logger.js (one JSON line per event) so Vercel's log search can
  // filter by field. console.warn and console.error stay allowed for failures.
  {
    files: ['api/**/*.js', 'src/lib/**/*.js', 'src/data/**/*.js', 'src/modules/**/*.js'],
    ignores: ['src/lib/logger.js', '**/*.test.mjs'],
    rules: { 'no-console': ['error', { allow: ['warn', 'error'] }] },
  },
]
