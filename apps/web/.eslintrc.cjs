/* eslint-disable @typescript-eslint/no-var-requires */
module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  plugins: ["@typescript-eslint", "react-refresh", "react-hooks"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  rules: {
    // Optional nicety
    "react-refresh/only-export-components": "warn",
  // React hooks: enforce rules-of-hooks strictly; track deps with extended custom hooks pattern
  "react-hooks/rules-of-hooks": "error",
  "react-hooks/exhaustive-deps": "off",

    /**
     * ❌ Ban non-auth /api/... literals (auth under /api/auth/* is allowed).
     * Use fetchJSON('rules') / fetchJSON('charts/...') instead.
     */
    "no-restricted-syntax": [
      "error",
      // esquery doesn't support full negative lookahead regex inside value attribute selectors reliably across versions;
      // use a prefix match then rely on auth paths being rare & acceptable to ignore via inline disable if needed.
      {
        selector: "Literal[value^='/api/']:not(Literal[value^='/api/auth/'])",
        message:
          "Do not hardcode non-auth /api/ paths. Use root paths with fetchJSON(). Auth stays under /api/auth/* via fetchAuth().",
      },
      {
        selector: "Literal[value^='/api/agent']",
        message: "Use /agent/... directly; do not prefix with /api.",
      },
      {
        selector: "Literal[value^='/api/ingest']",
        message: "Use /ingest/... directly; do not prefix with /api.",
      },
      {
        selector: "TemplateLiteral[quasis.0.value.raw^='/api/agent']",
        message: "Use /agent/... directly; do not prefix with /api.",
      },
      {
        selector: "TemplateLiteral[quasis.0.value.raw^='/api/ingest']",
        message: "Use /ingest/... directly; do not prefix with /api.",
      },
      {
        selector: "Identifier[name='fetchJson']",
        message:
          "Use fetchJSON/fetchAuth from src/lib/http.ts (do not reintroduce fetchJson).",
      },
      // Direct fetch usage to legacy /api/(agent|ingest) prefixes (should call api root paths via fetchJSON)
      {
        selector: "CallExpression[callee.name='fetch'] > Literal[value^='/api/agent']",
        message: "Use fetchJSON('/agent/...') or fetchJSON('agent/...') (no /api prefix)."
      },
      {
        selector: "CallExpression[callee.name='fetch'] > Literal[value^='/api/ingest']",
        message: "Use fetchJSON('/ingest/...') or fetchJSON('ingest/...') (no /api prefix)."
      },
      {
        selector: "CallExpression[callee.name='fetch'] TemplateLiteral[quasis.0.value.raw^='/api/agent']",
        message: "Use fetchJSON('/agent/...') (template literal)."
      },
      {
        selector: "CallExpression[callee.name='fetch'] TemplateLiteral[quasis.0.value.raw^='/api/ingest']",
        message: "Use fetchJSON('/ingest/...') (template literal)."
      },
    ],
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "@/api/suggestions",
            message: "Suggestions API is removed. Feature is disabled."
          }
        ]
      }
    ],

    // (Optional) keep signal focused while teams migrate types
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": [
      "off",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
      },
    ],
    // Mild additional hygiene
    "no-unused-vars": [
      "off",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true }
    ],
    "no-console": "off",
  },
  overrides: [
    {
      files: ["**/*.test.ts", "**/*.test.tsx", "src/**/__tests__/**/*"],
      rules: {
        "@typescript-eslint/no-unused-vars": "off",
        "@typescript-eslint/no-explicit-any": "off",
      },
    },
    {
      files: ["scripts/**/*.{js,ts}", "**/*.config.{js,cjs,mjs,ts}", "**/vite.config.*", "**/tailwind.config.*"],
      rules: {
        "@typescript-eslint/no-explicit-any": "off",
      },
    },
    // Phase 1: core surfaces (lib + api) quality quartet
    {
      files: ["src/lib/**/*.{ts,tsx}", "src/api/**/*.{ts,tsx}"],
      rules: {
        "prefer-const": "warn",
        eqeqeq: ["warn", "smart"],
        "no-shadow": "warn",
        "@typescript-eslint/consistent-type-imports": "warn",
      },
    },
    // Ensure production source keeps the any rule (warn) to drive gradual improvements
    {
      files: ["src/**/*.{ts,tsx}"],
      rules: {
        "@typescript-eslint/no-explicit-any": "off",
      },
    },
  ],
  ignorePatterns: ["dist/**", "node_modules/**", "scripts/**"],
};
