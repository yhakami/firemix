/**
 * Firemix Vite Plugin
 * Automatically generates .apphosting/bundle.yaml after Remix build
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { generateBundle, serializeBundle } from "./bundle.js";
import { createSecureDirectory, sanitizePath } from "./validation.js";

import type { Plugin, ResolvedConfig } from "vite";
import type { FiremixConfig } from "./types.js";

export interface FiremixPluginOptions extends FiremixConfig {
  /**
   * Whether to generate bundle.yaml (default: true in build mode)
   */
  enabled?: boolean;
}

/**
 * Vite plugin for Firemix
 * Add this to your vite.config.ts to automatically generate
 * the Firebase App Hosting bundle after build
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { firemix } from "firemix/vite";
 *
 * export default defineConfig({
 *   plugins: [remix(), firemix()],
 * });
 * ```
 */
export function firemix(options: FiremixPluginOptions = {}): Plugin {
  let projectRoot: string;
  let isBuildMode = false;

  return {
    name: "firemix",

    configResolved(config: ResolvedConfig) {
      projectRoot = config.root;
      isBuildMode = config.command === "build";
    },

    closeBundle() {
      // Only run in build mode (not dev server)
      const enabled = options.enabled ?? isBuildMode;
      if (!enabled) return;

      console.log("\n🔥 Firemix: Generating Firebase App Hosting bundle...");

      try {
        // Validate and sanitize outputDir
        const outputDir = options.outputDir
          ? sanitizePath(options.outputDir, projectRoot)
          : ".apphosting";

        const bundle = generateBundle(projectRoot, options);
        const yaml = serializeBundle(bundle);

        const outputPath = join(projectRoot, outputDir);

        // Secure directory creation (prevents symlink attacks)
        createSecureDirectory(outputPath);

        const bundlePath = join(outputPath, "bundle.yaml");
        writeFileSync(bundlePath, yaml, { encoding: "utf-8", mode: 0o644 });

        console.log(`✅ Firemix: Generated ${outputDir}/bundle.yaml`);
        console.log("   Ready for Firebase App Hosting deployment!\n");
      } catch (error) {
        console.error("❌ Firemix: Failed to generate bundle.yaml");
        console.error(error instanceof Error ? error.message : "Unknown error");

        if (process.env.DEBUG) {
          console.error("Full error:", error);
        }

        throw error;
      }
    },
  };
}

export default firemix;
