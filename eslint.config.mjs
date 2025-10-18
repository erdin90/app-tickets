import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "supabase/functions/**",
    ],
  },
  // Project-wide rule customizations to prevent lint from blocking builds
  {
    rules: {
      // Allow gradual typing: treat 'any' and ban-ts-comment as warnings instead of errors
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",

      // Unused vars: only warn, and ignore variables/args starting with '_'
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],

      // Prefer const: warn instead of error to avoid blocking CI on style-only issues
      "prefer-const": "warn",
    },
  },
];

export default eslintConfig;
