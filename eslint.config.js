import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", ".superpowers/**", "apps/mobile/.expo/**", "apps/mobile/ios/**", "apps/mobile/android/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["apps/web/**/*.tsx", "apps/mobile/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: { "react-hooks/rules-of-hooks": "error", "react-hooks/exhaustive-deps": "warn" },
  },
  {
    // Metro empacota modelos, sons e fontes por require(); a config do Metro é CommonJS
    files: ["apps/mobile/src/three/assets.ts", "apps/mobile/*.js"],
    languageOptions: { globals: { require: "readonly", module: "writable", __dirname: "readonly" } },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    files: ["apps/mobile/**/*.{ts,tsx}"],
    languageOptions: { globals: { __DEV__: "readonly" } },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
