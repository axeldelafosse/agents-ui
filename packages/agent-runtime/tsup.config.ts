import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/**/*.ts", "!src/**/*.test.ts"],
  format: "esm",
  sourcemap: true,
  splitting: false,
  dts: {
    compilerOptions: {
      baseUrl: ".",
      paths: {
        "@axel-delafosse/agent-runtime/*": ["./src/*"],
        "@axel-delafosse/protocol/*": ["../protocol/src/*"],
      },
    },
  },
  tsconfig: "tsconfig.build.json",
  external: ["@axel-delafosse/protocol", "react", "react-dom"],
});
