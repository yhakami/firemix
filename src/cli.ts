#!/usr/bin/env node
/**
 * Firemix CLI
 * Generate Firebase App Hosting bundle for Remix projects
 */

import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { generateBundle, serializeBundle } from "./bundle.js";
import { createSecureDirectory, sanitizePath, validateRemixProject } from "./validation.js";

import type { FiremixConfig } from "./types.js";

function printHelp(): void {
  console.log(`
🔥 Firemix - Firebase App Hosting adapter for Remix

Usage:
  firemix [options]

Options:
  --output, -o    Output directory (default: .apphosting)
  --build, -b     Remix build directory (default: build)
  --help, -h      Show this help message

Examples:
  firemix                    # Generate with defaults
  firemix -o .apphosting     # Specify output directory
  firemix -b dist            # Specify build directory
`);
}

interface ParsedArgs extends FiremixConfig {
  help?: boolean;
}

function parseArgs(args: string[], projectRoot: string): ParsedArgs {
  const config: ParsedArgs = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case "--help":
      case "-h":
        config.help = true;
        break;
      case "--output":
      case "-o":
        if (!next || next.startsWith("-")) {
          throw new Error("--output requires a directory name");
        }
        // Validate path to prevent traversal attacks
        config.outputDir = sanitizePath(next, projectRoot);
        i++;
        break;
      case "--build":
      case "-b":
        if (!next || next.startsWith("-")) {
          throw new Error("--build requires a directory name");
        }
        // buildDir is validated in generateBundle via sanitizeBuildDir
        config.buildDir = next;
        i++;
        break;
      default:
        if (arg.startsWith("-")) {
          throw new Error(`Unknown option: ${arg}`);
        }
    }
  }

  return config;
}

function main(): void {
  const projectRoot = resolve(process.cwd());

  try {
    const args = process.argv.slice(2);
    const config = parseArgs(args, projectRoot);

    if (config.help) {
      printHelp();
      process.exit(0);
    }

    console.log("\n🔥 Firemix: Generating Firebase App Hosting bundle...\n");

    // Validate this is a Remix project
    validateRemixProject(projectRoot);

    const outputDir = config.outputDir || ".apphosting";
    const bundle = generateBundle(projectRoot, config);
    const yaml = serializeBundle(bundle);

    const outputPath = join(projectRoot, outputDir);

    // Secure directory creation (prevents symlink attacks)
    createSecureDirectory(outputPath);

    const bundlePath = join(outputPath, "bundle.yaml");
    writeFileSync(bundlePath, yaml, { encoding: "utf-8", mode: 0o644 });

    console.log(`✅ Generated ${outputDir}/bundle.yaml`);
    console.log("\nBundle configuration:");
    console.log(`   Run command: ${bundle.runConfig.runCommand}`);
    console.log(`   Memory: ${bundle.runConfig.memoryMiB}MiB`);
    console.log(`   CPU: ${bundle.runConfig.cpu}`);
    console.log(`   Concurrency: ${bundle.runConfig.concurrency}`);
    console.log(`   Min instances: ${bundle.runConfig.minInstances}`);
    console.log(`   Max instances: ${bundle.runConfig.maxInstances}`);
    console.log("\n🚀 Ready for Firebase App Hosting deployment!\n");
  } catch (error) {
    console.error("❌ Failed to generate bundle.yaml");
    console.error(error instanceof Error ? error.message : "Unknown error");

    if (process.env.DEBUG) {
      console.error("\nFull error:", error);
    }

    process.exit(1);
  }
}

main();
