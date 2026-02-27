import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/**/*.ts", "!src/**/*.test.ts"],
  format: "esm",
  sourcemap: true,
  splitting: false,
  dts: {
    resolve: true,
    compilerOptions: {
      baseUrl: ".",
      paths: {
        "@axel-delafosse/protocol/*": ["./src/*"],
        "@axel-delafosse/codex-app-server-schemas": [
          "../../codex-app-server-schemas",
        ],
        "@axel-delafosse/codex-app-server-schemas/*": [
          "../../codex-app-server-schemas/*",
        ],
      },
    },
  },
  tsconfig: "tsconfig.build.json",
});
