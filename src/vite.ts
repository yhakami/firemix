/**
 * Firemix Vite Plugin
 * Automatically generates .apphosting/bundle.yaml after Remix build
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { generateBundle, serializeBundle } from "./bundle.js";

import type { Plugin } from "vite";
import type { FiremixConfig } from "./types.js";

export interface FiremixPluginOptions extends FiremixConfig {
  /**
   * Whether to generate bundle.yaml (default: true in production build)
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
  const outputDir = options.outputDir || ".apphosting";
  let projectRoot: string;

  return {
    name: "firemix",

    configResolved(config) {
      projectRoot = config.root;
    },

    closeBundle() {
      // Only run in build mode (not dev server)
      const enabled = options.enabled ?? process.env.NODE_ENV === "production";
      if (!enabled) return;

      console.log("\n🔥 Firemix: Generating Firebase App Hosting bundle...");

      try {
        const bundle = generateBundle(projectRoot, options);
        const yaml = serializeBundle(bundle);

        const outputPath = join(projectRoot, outputDir);
        if (!existsSync(outputPath)) {
          mkdirSync(outputPath, { recursive: true });
        }

        const bundlePath = join(outputPath, "bundle.yaml");
        writeFileSync(bundlePath, yaml, "utf-8");

        console.log(`✅ Firemix: Generated ${outputDir}/bundle.yaml`);
        console.log("   Ready for Firebase App Hosting deployment!\n");
      } catch (error) {
        console.error("❌ Firemix: Failed to generate bundle.yaml");
        console.error(error);
        throw error;
      }
    },
  };
}

export default firemix;
