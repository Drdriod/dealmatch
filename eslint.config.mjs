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
]
