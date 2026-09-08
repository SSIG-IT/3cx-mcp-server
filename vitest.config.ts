import { defineConfig } from "vitest/config";

/**
 * The source uses ESM ".js" import specifiers (Node16 module resolution), but the
 * files on disk are ".ts". This pre-resolver rewrites relative ".js" imports to the
 * matching ".ts" source so Vitest can load them without a build step.
 */
export default defineConfig({
  plugins: [
    {
      name: "resolve-js-to-ts",
      enforce: "pre",
      async resolveId(source, importer) {
        if (importer && source.startsWith(".") && source.endsWith(".js")) {
          const resolved = await this.resolve(source.slice(0, -3) + ".ts", importer, {
            skipSelf: true,
          });
          if (resolved) return resolved;
        }
        return null;
      },
    },
  ],
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
