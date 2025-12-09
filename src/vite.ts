/**
 * Firemix Vite Plugin
 * Automatically generates .apphosting/bundle.yaml after Remix build
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { generateBundleWithMetadata, serializeBundle } from "./bundle.js";
import { createSecureDirectory, sanitizePath, validateRemixProject } from "./validation.js";

import type { Plugin, ResolvedConfig } from "vite";
import type { FiremixConfig } from "./types.js";

export interface FiremixPluginOptions extends FiremixConfig {
  /**
   * Whether to generate bundle.yaml (default: true in build mode)
   */
  enabled?: boolean;

  /**
   * Show detailed output during build
   */
  verbose?: boolean;
}

/**
 * Vite plugin for Firemix
 * Add this to your vite.config.ts to automatically generate
 * the Firebase App Hosting bundle after build
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { vitePlugin as remix } from "@remix-run/dev";
 * import { defineConfig } from "vite";
 * import { firemix } from "firemix/vite";
 *
 * export default defineConfig({
 *   plugins: [remix(), firemix()],
 * });
 * ```
 *
 * @example
 * ```ts
 * // vite.config.ts with custom configuration
 * import { vitePlugin as remix } from "@remix-run/dev";
 * import { defineConfig } from "vite";
 * import { firemix } from "firemix/vite";
 *
 * export default defineConfig({
 *   plugins: [
 *     remix({ buildDirectory: "dist" }),
 *     firemix({
 *       buildDirectory: "dist",
 *       runConfig: {
 *         minInstances: 1,
 *         memoryMiB: 1024,
 *       },
 *     }),
 *   ],
 * });
 * ```
 */
export function firemix(options: FiremixPluginOptions = {}): Plugin {
  let projectRoot: string;
  let isBuildMode = false;
  let isSsrBuild = false;
  const verbose = options.verbose ?? false;

  return {
    name: "firemix",

    configResolved(config: ResolvedConfig) {
      projectRoot = config.root;
      isBuildMode = config.command === "build";
      isSsrBuild = Boolean(config.build?.ssr);
    },

    closeBundle() {
      // Only run in build mode (not dev server)
      const enabled = options.enabled ?? isBuildMode;
      if (!enabled) return;

      // Remix runs two Vite builds (client + server). We only want to run
      // Firemix once the server build is done, otherwise the server entry
      // point does not exist yet and verification fails.
      if (!isSsrBuild) {
        return;
      }

      console.log("\n🔥 Firemix: Generating Firebase App Hosting bundle...");

      try {
        // Validate this is a Remix project (same as CLI)
        validateRemixProject(projectRoot);

        // Validate and sanitize outputDir
        const outputDir = options.outputDir
          ? sanitizePath(options.outputDir, projectRoot)
          : ".apphosting";

        // Generate bundle with metadata
        const { bundle, remixConfig, warnings } = generateBundleWithMetadata(projectRoot, options);
        const yaml = serializeBundle(bundle);

        // Show warnings
        for (const warning of warnings) {
          console.log(`   ⚠️  ${warning}`);
        }

        const outputPath = join(projectRoot, outputDir);

        // Secure directory creation (prevents symlink attacks)
        createSecureDirectory(outputPath);

        const bundlePath = join(outputPath, "bundle.yaml");
        writeFileSync(bundlePath, yaml, { encoding: "utf-8", mode: 0o644 });

        console.log(`✅ Firemix: Generated ${outputDir}/bundle.yaml`);

        if (verbose) {
          console.log("\n   Bundle configuration:");
          console.log(`      Run command: ${bundle.runConfig.runCommand}`);
          console.log(`      Memory: ${bundle.runConfig.memoryMiB}MiB`);
          console.log(`      CPU: ${bundle.runConfig.cpu}`);
          console.log(
            `      Instances: ${bundle.runConfig.minInstances}-${bundle.runConfig.maxInstances}`
          );
          console.log("\n   Resolved paths:");
          console.log(`      Server: ${remixConfig.serverBuildPath}`);
          console.log(`      Client: ${remixConfig.clientBuildDir}`);

          if (bundle.metadata.frameworkVersion) {
            console.log(`\n   Remix version: ${bundle.metadata.frameworkVersion}`);
          }
        }

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
