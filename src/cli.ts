#!/usr/bin/env node
/**
 * Firemix CLI
 * Generate Firebase App Hosting bundle for Remix projects
 */

import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { generateBundleWithMetadata, serializeBundle } from "./bundle.js";
import { resolveRemixConfig } from "./config.js";
import { createSecureDirectory, sanitizePath, validateRemixProject } from "./validation.js";
import { verifyBuildOutput, formatVerificationResult } from "./verify.js";
import { getAdapterVersion, getVersionInfo } from "./version.js";

import type { FiremixConfig } from "./types.js";

// ESM equivalent of __dirname
const __dirname = dirname(fileURLToPath(import.meta.url));

const VERSION = getAdapterVersion(join(__dirname, ".."));

function printHelp(): void {
  console.log(`
🔥 Firemix v${VERSION} - Firebase App Hosting adapter for Remix

Usage:
  firemix [options]

Options:
  --output, -o <dir>        Output directory (default: .apphosting)
  --build, -b <dir>         Remix build directory (default: build)
  --server-file <name>      Server entry file name (default: index.js)
  --run-command <cmd>       Override the run command for Cloud Run
  --allow-dev-deps          Allow bundling when devDependencies are installed
  --allow-symlinks          Allow symlinked packages in node_modules
  --no-verify               Skip build output verification
  --dry-run                 Preview bundle.yaml without writing
  --verify-only             Only verify build output, don't generate bundle
  --version, -v             Show version number
  --help, -h                Show this help message

Cloud Run options:
  --min-instances <n>       Minimum instances (default: 0)
  --max-instances <n>       Maximum instances (default: 10)
  --concurrency <n>         Concurrent requests per instance (default: 80)
  --cpu <n>                 CPU allocation (default: 1)
  --memory <n>              Memory in MiB (default: 512)

Examples:
  firemix                        # Generate with defaults
  firemix -o .apphosting         # Specify output directory
  firemix -b dist                # Specify build directory
  firemix --dry-run              # Preview without writing
  firemix --verify-only          # Just verify build output
  firemix --run-command "deno run --allow-all build/server/index.js"
`);
}

function printVersion(): void {
  console.log(`firemix v${VERSION}`);
}

interface ParsedArgs extends FiremixConfig {
  help?: boolean;
  version?: boolean;
  dryRun?: boolean;
  verifyOnly?: boolean;
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

      case "--version":
      case "-v":
        config.version = true;
        break;

      case "--dry-run":
        config.dryRun = true;
        break;

      case "--verify-only":
        config.verifyOnly = true;
        break;

      case "--no-verify":
        config.verify = false;
        break;

      case "--allow-dev-deps":
        config.allowDevDependencies = true;
        break;

      case "--allow-symlinks":
        config.allowSymlinks = true;
        break;

      case "--output":
      case "-o":
        if (!next || next.startsWith("-")) {
          throw new Error("--output requires a directory name");
        }
        config.outputDir = sanitizePath(next, projectRoot);
        i++;
        break;

      case "--build":
      case "-b":
        if (!next || next.startsWith("-")) {
          throw new Error("--build requires a directory name");
        }
        config.buildDirectory = next;
        i++;
        break;

      case "--server-file":
        if (!next || next.startsWith("-")) {
          throw new Error("--server-file requires a file name");
        }
        config.serverBuildFile = next;
        i++;
        break;

      case "--run-command":
        if (!next) {
          throw new Error("--run-command requires a command string");
        }
        config.runCommand = next;
        i++;
        break;

      case "--min-instances":
        if (!next || isNaN(parseInt(next, 10))) {
          throw new Error("--min-instances requires a number");
        }
        config.runConfig = config.runConfig || {};
        config.runConfig.minInstances = parseInt(next, 10);
        i++;
        break;

      case "--max-instances":
        if (!next || isNaN(parseInt(next, 10))) {
          throw new Error("--max-instances requires a number");
        }
        config.runConfig = config.runConfig || {};
        config.runConfig.maxInstances = parseInt(next, 10);
        i++;
        break;

      case "--concurrency":
        if (!next || isNaN(parseInt(next, 10))) {
          throw new Error("--concurrency requires a number");
        }
        config.runConfig = config.runConfig || {};
        config.runConfig.concurrency = parseInt(next, 10);
        i++;
        break;

      case "--cpu":
        if (!next || isNaN(parseInt(next, 10))) {
          throw new Error("--cpu requires a number");
        }
        config.runConfig = config.runConfig || {};
        config.runConfig.cpu = parseInt(next, 10);
        i++;
        break;

      case "--memory":
        if (!next || isNaN(parseInt(next, 10))) {
          throw new Error("--memory requires a number (MiB)");
        }
        config.runConfig = config.runConfig || {};
        config.runConfig.memoryMiB = parseInt(next, 10);
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

    if (config.version) {
      printVersion();
      process.exit(0);
    }

    // Validate this is a Remix project
    validateRemixProject(projectRoot);

    // Verify-only mode
    if (config.verifyOnly) {
      console.log("\n🔍 Firemix: Verifying build output...\n");

      const remixConfig = resolveRemixConfig(projectRoot);
      const verification = verifyBuildOutput(projectRoot, remixConfig);

      console.log(formatVerificationResult(verification));

      if (verification.valid) {
        console.log("\n✅ Build verification passed - ready for bundle generation\n");
        process.exit(0);
      } else {
        process.exit(1);
      }
    }

    console.log("\n🔥 Firemix: Generating Firebase App Hosting bundle...\n");

    // Show version info in debug mode
    if (process.env.DEBUG) {
      const versionInfo = getVersionInfo(projectRoot, join(__dirname, ".."));
      console.log("Version info:", versionInfo);
    }

    const outputDir = config.outputDir || ".apphosting";
    const { bundle, remixConfig, warnings } = generateBundleWithMetadata(projectRoot, config);
    const yaml = serializeBundle(bundle);

    // Show warnings
    for (const warning of warnings) {
      console.log(`⚠️  ${warning}`);
    }

    // Dry run mode - just print the YAML
    if (config.dryRun) {
      console.log("📋 Dry run - bundle.yaml content:\n");
      console.log(yaml);
      console.log("\nResolved Remix configuration:");
      console.log(`   Build directory: ${remixConfig.buildDirectory}`);
      console.log(`   Server entry: ${remixConfig.serverBuildPath}`);
      console.log(`   Client assets: ${remixConfig.clientBuildDir}`);
      console.log("\n✅ Dry run complete - no files written\n");
      process.exit(0);
    }

    // Write the bundle
    const outputPath = join(projectRoot, outputDir);
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
    console.log("\nResolved paths:");
    console.log(`   Server: ${remixConfig.serverBuildPath}`);
    console.log(`   Client: ${remixConfig.clientBuildDir}`);

    if (bundle.metadata.frameworkVersion) {
      console.log(`\nRemix version: ${bundle.metadata.frameworkVersion}`);
    }

    console.log("\n🚀 Ready for Firebase App Hosting deployment!\n");
    console.log("Next steps:");
    console.log("  1. firebase init apphosting   (if not already done)");
    console.log("  2. git add . && git commit");
    console.log("  3. git push                   (triggers deployment)\n");
  } catch (error) {
    console.error("❌ Firemix: Failed to generate bundle.yaml");
    console.error(error instanceof Error ? error.message : "Unknown error");

    if (process.env.DEBUG) {
      console.error("\nFull error:", error);
    }

    process.exit(1);
  }
}

// Support being imported as a module for testing
export { parseArgs, main };

// Run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main();
}
