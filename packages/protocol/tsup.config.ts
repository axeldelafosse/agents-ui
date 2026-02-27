import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/**/*.ts", "!src/**/*.test.ts"],
  format: "esm",
  sourcemap: true,
  splitting: false,
  dts: { resolve: true },
  tsconfig: "tsconfig.build.json",
});
