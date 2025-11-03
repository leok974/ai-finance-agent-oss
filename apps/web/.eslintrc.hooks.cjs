/* Focused hooks-only ESLint config for fast CI gating without unrelated noise */
module.exports = {
  // root true so this config does NOT inherit the full project rules; we only want structural hook checks
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  env: { browser: true, es2022: true },
  plugins: ['react-hooks', '@typescript-eslint'],
  rules: {
    'react-hooks/rules-of-hooks': 'error',
    // disable exhaustive-deps for focused hook structural enforcement run
    'react-hooks/exhaustive-deps': 'off',
    // blanket disable TS-specific lint rules (we don't need them in this focused pass)
    '@typescript-eslint/ban-ts-comment': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
  },
  ignorePatterns: ['dist/**','node_modules/**']
};
