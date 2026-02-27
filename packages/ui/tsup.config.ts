import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/**/*.ts",
    "src/**/*.tsx",
    "!src/**/*.test.ts",
    "!src/**/*.test.tsx",
    "!src/**/*.stories.tsx",
    "!src/__fixtures__/**",
  ],
  format: "esm",
  sourcemap: true,
  splitting: false,
  dts: {
    compilerOptions: {
      baseUrl: ".",
      paths: {
        "@axel-delafosse/ui/*": ["./src/*"],
        "@axel-delafosse/agent-runtime/*": ["../agent-runtime/src/*"],
        "@axel-delafosse/protocol/*": ["../protocol/src/*"],
      },
    },
  },
  tsconfig: "tsconfig.build.json",
  external: [
    "@axel-delafosse/protocol",
    "@axel-delafosse/agent-runtime",
    "@base-ui/react",
    "@legendapp/list",
    "class-variance-authority",
    "motion",
    "next",
    "react",
    "react-dom",
    "streamdown",
    "tw-animate-css",
  ],
});
