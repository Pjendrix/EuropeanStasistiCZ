// Lint JS v CI (audit A9). Skripty jsou klasické <script> se sdílenými globály z app.js/share.js,
// proto bez no-undef a no-unused-vars (funkce používají stránky); hlídají se chyby a podezřelé vzory.
import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    files: ["public/*.js", "tests/e2e/*.mjs"],
    languageOptions: { ecmaVersion: 2024, sourceType: "script" },
    rules: { "no-undef": "off", "no-unused-vars": "off", "no-empty": ["error", { allowEmptyCatch: true }] },
  },
  { files: ["tests/e2e/*.mjs", "eslint.config.mjs"], languageOptions: { sourceType: "module" } },
];
