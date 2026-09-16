module.exports = {
  root: true,
  env: { node: true, es2022: true },
  extends: ['eslint:recommended', 'plugin:security/recommended-legacy'],
  ignorePatterns: ['coverage', 'node_modules'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['security'],
  rules: {
    'no-console': ['warn', { allow: ['error', 'warn'] }],
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'security/detect-object-injection': 'warn',
    'security/detect-non-literal-fs-filename': 'warn',
    'security/detect-non-literal-regexp': 'warn',
    'security/detect-unsafe-regex': 'error',
  },
}
