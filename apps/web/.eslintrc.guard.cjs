module.exports = {
  // Standalone guard config: invoked with --no-eslintrc so ONLY these rules run.
  env: { node: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  rules: {
    'no-restricted-syntax': [
      'error',
      { selector: "Literal[value^='/api/']:not(Literal[value^='/api/auth/'])", message: 'Do not hardcode non-auth /api/ paths. Use root paths with fetchJSON().' },
      { selector: "Identifier[name='fetchJson']", message: 'Use fetchJSON/fetchAuth from src/lib/http.ts (do not reintroduce fetchJson).' },
    ],
  },
  ignorePatterns: ['dist/**','node_modules/**'],
};
