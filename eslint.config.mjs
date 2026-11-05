import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import field from "./eslint-rules/index.mjs";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  { ignores: [".next/**", "node_modules/**", "public/**", "supabase/**", "scripts/**", "docs/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals"),
  {
    // Netlify functions and config files export their handler/config anonymously by convention.
    files: ["netlify/**", "*.config.{mjs,ts}", "eslint-rules/**"],
    rules: { "import/no-anonymous-default-export": "off" },
  },
  {
    // A failed query must never look like "no rows" (cleanup batch 1).
    files: ["app/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "netlify/**/*.{ts,mts}", "middleware.ts"],
    ignores: [
      "**/*.test.ts",
      "**/*.test.tsx",
      // The live card-payment webhook is left exactly as it is; its one unchecked
      // call (a notification nobody reads since the bell went) goes with the
      // notifications table.
      "app/api/stripe/estimator-webhook/route.ts",
    ],
    plugins: { field },
    rules: { "field/supabase-checked": "error" },
  },
];

export default config;
