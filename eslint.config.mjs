// The rules and limits here change only with Joe's approval (DEVELOPMENT.md section 6).
import eslint from "@eslint/js";
import eslintComments from "@eslint-community/eslint-plugin-eslint-comments/configs";
import eslintReact from "@eslint-react/eslint-plugin";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import { defineConfig, globalIgnores } from "eslint/config";
import noBarrelFiles from "eslint-plugin-no-barrel-files";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

const NAMING_CONVENTION = [
  "error",
  // Names follow the Google guide (DEVELOPMENT.md section 3).
  { selector: "default", format: ["camelCase"] },
  { selector: "typeLike", format: ["PascalCase"] },
  // Lint can't tell a fixed value from any other top-level const, so both are allowed.
  {
    selector: "variable",
    modifiers: ["const", "global"],
    format: ["camelCase", "UPPER_CASE"],
  },
  { selector: "enumMember", format: ["UPPER_CASE"] },
  { selector: "import", format: ["camelCase", "PascalCase"] },
  // Keys such as "@typescript-eslint/naming-convention" can't be renamed.
  {
    selector: ["objectLiteralProperty", "typeProperty"],
    modifiers: ["requiresQuotes"],
    format: null,
  },
];

const READABILITY_LIMITS = {
  complexity: ["error", 10],
  "max-depth": ["error", 3],
  "max-lines-per-function": [
    "error",
    { max: 50, skipBlankLines: true, skipComments: true },
  ],
  "max-params": ["error", 4],
  "max-lines": [
    "error",
    { max: 300, skipBlankLines: true, skipComments: true },
  ],
};

const ESCAPE_HATCH_BANS = {
  "@typescript-eslint/no-explicit-any": "error",
  "@typescript-eslint/no-non-null-assertion": "error",
  "@typescript-eslint/ban-ts-comment": [
    "error",
    {
      "ts-ignore": true,
      "ts-nocheck": true,
      "ts-expect-error": "allow-with-description",
    },
  ],
  "@eslint-community/eslint-comments/require-description": "error",
  "@eslint-community/eslint-comments/no-unlimited-disable": "error",
};

// Schemas for outside data go in *.schema.ts files (DEVELOPMENT.md section 4). Other
// files may import Zod's types, but not Zod itself. Turned off for schema files and tests.
const ZOD_MESSAGE =
  "Put the schema in a *.schema.ts file (DEVELOPMENT.md section 4). Other files may import only Zod's types.";
const ZOD_ONLY_IN_SCHEMA_FILES = [
  "error",
  {
    paths: [{ name: "zod", allowTypeImports: true, message: ZOD_MESSAGE }],
    patterns: [
      { group: ["zod/*"], allowTypeImports: true, message: ZOD_MESSAGE },
    ],
  },
];

export default defineConfig(
  // Build output, not source.
  globalIgnores(["dist/", "coverage/"]),
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  eslintComments.recommended,
  noBarrelFiles.configs["flat/recommended"],
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
    rules: {
      // In the presets already. Listed so nobody turns them off.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",

      "@typescript-eslint/naming-convention": NAMING_CONVENTION,
      "no-restricted-exports": [
        "error",
        {
          restrictDefaultExports: {
            direct: true,
            named: true,
            defaultFrom: true,
            namedFrom: true,
            namespaceFrom: true,
          },
        },
      ],
      // Outside data is checked with Zod, never asserted (DEVELOPMENT.md section 4).
      // ESLint can't tell outside data apart, so this bans every `as` except `as const`.
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        { assertionStyle: "never" },
      ],
      "@typescript-eslint/no-restricted-imports": ZOD_ONLY_IN_SCHEMA_FILES,
      ...READABILITY_LIMITS,
      ...ESCAPE_HATCH_BANS,
    },
  },
  {
    // Tools such as ESLint need a default export from their config files.
    files: ["**/*.config.{js,mjs,cjs,ts,mts,cts}"],
    rules: {
      "no-restricted-exports": "off",
    },
  },
  {
    // Schemas for outside data keep the outside names, such as Open-Meteo's
    // `temperature_2m_max`. Each schema converts them to camelCase after parsing.
    files: ["**/*.schema.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": "off",
      "@typescript-eslint/naming-convention": [
        ...NAMING_CONVENTION,
        {
          selector: ["objectLiteralProperty", "typeProperty"],
          format: ["camelCase", "snake_case"],
        },
      ],
    },
  },
  {
    // The front end. The React rules are the strictest type-checked set, and Vite's
    // fast refresh rule keeps each component file exporting only components.
    files: ["web/**/*.{ts,tsx}"],
    extends: [
      eslintReact.configs["strict-type-checked"],
      reactRefresh.configs.vite,
    ],
  },
  {
    // React components are functions named in PascalCase, such as `HealthStatus`.
    files: ["web/**/*.tsx"],
    rules: {
      "@typescript-eslint/naming-convention": [
        ...NAMING_CONVENTION,
        { selector: "function", format: ["camelCase", "PascalCase"] },
      ],
    },
  },
  {
    // Plain JavaScript files, such as this one, aren't in tsconfig.json.
    files: ["**/*.{js,mjs,cjs}"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ["**/*.test.ts"],
    rules: {
      "max-lines-per-function": "off",
      // Tests check parse failures, such as with ZodError.
      "@typescript-eslint/no-restricted-imports": "off",
    },
  },
  // Last, so ESLint doesn't fight Prettier.
  eslintConfigPrettier,
);
