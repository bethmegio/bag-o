// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  
  {
    ignores: ['dist/*'],
    base: process.env.VITE_BASE_PATH || "/apppppppp",  expoConfig,
  },
]);
