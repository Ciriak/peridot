import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import prettier from "eslint-config-prettier/flat";
import vue from "eslint-plugin-vue";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores([
    "**/node_modules/**",
    "**/.turbo/**",
    "**/.nuxt/**",
    "**/.output/**",
    "**/.peridot/**",
    "**/dist/**",
    "**/coverage/**",
    "**/generated/**",
    "**/src/prisma/contract.d.ts",
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  vue.configs["flat/essential"],
  {
    files: ["**/*.vue"],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    files: ["apps/server/**/*.ts", "**/*.config.{js,mjs,ts}"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["apps/web/**/*.{ts,vue}"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["apps/web/nuxt.config.ts"],
    languageOptions: { globals: { defineNuxtConfig: "readonly" } },
  },
  {
    files: ["packages/ui/src/components/ui/**/*.vue"],
    rules: { "vue/multi-word-component-names": "off" },
  },
  {
    files: ["apps/web/app/{layouts,pages}/**/*.vue"],
    rules: { "vue/multi-word-component-names": "off" },
  },
  prettier,
]);
