#!/usr/bin/env node
/**
 * Firemix CLI
 * Generate Firebase App Hosting bundle for Remix projects
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { generateBundle, serializeBundle } from "./bundle.js";

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

function parseArgs(args: string[]): FiremixConfig & { help?: boolean } {
  const config: FiremixConfig & { help?: boolean } = {};

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
        config.outputDir = next;
        i++;
        break;
      case "--build":
      case "-b":
        config.buildDir = next;
        i++;
        break;
    }
  }

  return config;
}

function main(): void {
  const args = process.argv.slice(2);
  const config = parseArgs(args);

  if (config.help) {
    printHelp();
    process.exit(0);
  }

  const projectRoot = resolve(process.cwd());
  const outputDir = config.outputDir || ".apphosting";

  console.log("\n🔥 Firemix: Generating Firebase App Hosting bundle...\n");

  // Check if this looks like a Remix project
  const packageJsonPath = join(projectRoot, "package.json");
  if (!existsSync(packageJsonPath)) {
    console.error("❌ Error: No package.json found in current directory");
    process.exit(1);
  }

  try {
    const bundle = generateBundle(projectRoot, config);
    const yaml = serializeBundle(bundle);

    const outputPath = join(projectRoot, outputDir);
    if (!existsSync(outputPath)) {
      mkdirSync(outputPath, { recursive: true });
    }

    const bundlePath = join(outputPath, "bundle.yaml");
    writeFileSync(bundlePath, yaml, "utf-8");

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
    console.error(error);
    process.exit(1);
  }
}

main();
