import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    /**
     * apps/mobile is React Native, not the DOM, and two web rules misfire there:
     *
     * - `jsx-a11y/alt-text` sees `<Image>` and asks for an `alt` prop. React
     *   Native's Image has no `alt`; the equivalent is `accessibilityLabel`, which
     *   the rule does not know about, so it demands an attribute that would do
     *   nothing.
     * - `no-require-imports` flags `require("../assets/logo.png")`, which is how
     *   Metro resolves a static asset into a source object. It is the documented
     *   form, not a legacy import.
     */
    files: ["apps/mobile/**"],
    rules: {
      "jsx-a11y/alt-text": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    rules: {
      /**
       * A leading underscore already means "deliberately unused" in this codebase —
       * it is how `const { id: _id, ...rest } = user` drops a key, and how a
       * component signature documents a prop it ignores. Without this the rule
       * fires on the very pattern that was written to silence it.
       */
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
]);

export default eslintConfig;
