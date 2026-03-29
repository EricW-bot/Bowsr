// https://docs.expo.dev/guides/using-eslint/
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  globalIgnores([
    'dist/**',
    'web-build/**',
    '.expo/**',
    'node_modules/**',
    'android/**',
    'ios/**',
  ]),
  expoConfig,
]);
