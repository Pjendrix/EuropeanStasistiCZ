// Lint JS v CI (audit A9). Skripty webu jsou ES moduly (audit A2): co se sdílí, se importuje z public/lib/*.js,
// takže no-undef a no-unused-vars hlídají překlepy a zapomenuté importy. Globály prohlížeče jsou vyjmenované níže.
import js from "@eslint/js";

const BROWSER = Object.fromEntries([
  "window", "document", "location", "history", "navigator", "localStorage", "sessionStorage", "matchMedia", "fetch",
  "URL", "URLSearchParams", "Blob", "File", "FileReader", "Image", "Event", "CustomEvent", "HTMLElement", "Node",
  "IntersectionObserver", "ResizeObserver", "MutationObserver", "requestAnimationFrame", "cancelAnimationFrame",
  "setTimeout", "clearTimeout", "setInterval", "clearInterval", "getComputedStyle", "CSS", "Intl", "AbortController",
  "ClipboardItem", "DOMParser", "TextEncoder", "crypto", "performance", "console", "queueMicrotask", "structuredClone",
  "devicePixelRatio", "innerWidth", "innerHeight", "scrollY", "scrollTo", "alert", "OffscreenCanvas", "FontFace",
].map((n) => [n, "readonly"]));

export default [
  js.configs.recommended,
  {
    files: ["public/**/*.js"],
    ignores: ["public/theme.js"],
    languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: BROWSER },
    rules: {
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["public/theme.js"],
    languageOptions: { ecmaVersion: 2024, sourceType: "script", globals: BROWSER },
    rules: { "no-empty": ["error", { allowEmptyCatch: true }] },
  },
  {
    files: ["tests/**/*.mjs", "eslint.config.mjs"],
    languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: { ...BROWSER, process: "readonly" } },
    rules: { "no-undef": "off", "no-unused-vars": "off", "no-empty": ["error", { allowEmptyCatch: true }] },
  },
];
