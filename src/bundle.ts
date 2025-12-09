/**
 * Firemix - Bundle.yaml generator
 * Generates the .apphosting/bundle.yaml file for Firebase App Hosting
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveRemixConfig, applyConfigOverrides } from "./config.js";
import { getAdapterVersion, getResolvedRemixVersion } from "./version.js";
import { verifyBuildOutput, formatVerificationResult } from "./verify.js";
import {
  assertNoDevDependenciesInstalled,
  validateRunConfig,
  sanitizeBuildDir,
} from "./validation.js";

import type { BundleYaml, FiremixConfig, ResolvedRemixConfig } from "./types.js";

// ESM equivalent of __dirname
const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Generate the run command for the server.
 * Default: run remix-serve from local node_modules to spin up an HTTP server.
 * Quotes paths if they contain spaces.
 */
function generateRunCommand(config: ResolvedRemixConfig, customCommand?: string): string {
  if (customCommand) {
    return customCommand;
  }

  const remixServeBin = "node_modules/.bin/remix-serve";
  const serverPath = config.serverBuildPath;

  const quoteIfNeeded = (value: string) => (value.includes(" ") ? `"${value}"` : value);

  return `${quoteIfNeeded(remixServeBin)} ${quoteIfNeeded(serverPath)}`;
}

/**
 * Derive the directory that contains the server build entry
 */
function getServerBuildDir(serverBuildPath: string): string {
  const idx = serverBuildPath.lastIndexOf("/");
  if (idx === -1) return ".";
  return serverBuildPath.slice(0, idx);
}

/**
 * Result of bundle generation
 */
export interface GenerateBundleResult {
  /** The generated bundle configuration */
  bundle: BundleYaml;
  /** Resolved Remix configuration used */
  remixConfig: ResolvedRemixConfig;
  /** Any warnings generated during bundle creation */
  warnings: string[];
}

/**
 * Generate the bundle.yaml content
 *
 * @param projectRoot - Project root directory
 * @param config - Firemix configuration options
 * @returns Generated bundle and metadata
 */
export function generateBundle(projectRoot: string, config: FiremixConfig = {}): BundleYaml {
  const result = generateBundleWithMetadata(projectRoot, config);
  return result.bundle;
}

/**
 * Generate the bundle.yaml content with full metadata
 *
 * @param projectRoot - Project root directory
 * @param config - Firemix configuration options
 * @returns Generated bundle, resolved config, and warnings
 */
export function generateBundleWithMetadata(
  projectRoot: string,
  config: FiremixConfig = {}
): GenerateBundleResult {
  const warnings: string[] = [];

  // 1. Resolve Remix configuration from project files
  let remixConfig = resolveRemixConfig(projectRoot);

  // 2. Apply user overrides (buildDir for backwards compatibility, buildDirectory preferred)
  const buildDirectory = config.buildDirectory || config.buildDir;
  if (buildDirectory) {
    // Validate the build directory name
    sanitizeBuildDir(buildDirectory);
    remixConfig = applyConfigOverrides(remixConfig, {
      buildDirectory,
      serverBuildFile: config.serverBuildFile,
    });
  } else if (config.serverBuildFile) {
    remixConfig = applyConfigOverrides(remixConfig, {
      serverBuildFile: config.serverBuildFile,
    });
  }

  // 3. Verify build output exists (if enabled, default true)
  const shouldVerify = config.verify !== false;
  if (shouldVerify) {
    const verification = verifyBuildOutput(projectRoot, remixConfig);

    if (!verification.valid) {
      throw new Error(`Build verification failed:\n${formatVerificationResult(verification)}`);
    }

    // Collect warnings
    warnings.push(...verification.warnings);
  }

  // 4. Validate runConfig numeric values
  const runConfig = validateRunConfig(config.runConfig || {});

  // 5. Check for dev dependencies (unless explicitly allowed)
  assertNoDevDependenciesInstalled(projectRoot, {
    allowDevDependencies: config.allowDevDependencies,
    allowSymlinks: config.allowSymlinks,
  });

  // 6. Get version information
  const adapterVersion = getAdapterVersion(join(__dirname, ".."));
  const remixVersion = getResolvedRemixVersion(projectRoot);

  // Warn if Remix version couldn't be resolved
  if (!remixVersion) {
    warnings.push(
      "Could not resolve Remix version from node_modules. " +
        "The frameworkVersion field will be omitted from bundle.yaml."
    );
  }

  // 7. Generate the bundle
  const bundle: BundleYaml = {
    version: "v1",
    runConfig: {
      runCommand: generateRunCommand(remixConfig, config.runCommand),
      concurrency: runConfig.concurrency,
      cpu: runConfig.cpu,
      memoryMiB: runConfig.memoryMiB,
      minInstances: runConfig.minInstances,
      maxInstances: runConfig.maxInstances,
    },
    outputFiles: {
      // Server app - include the server build directory, package.json, and node_modules
      // Using the directory of the server entry ensures chunks or supporting files are included
      serverApp: {
        include: [
          getServerBuildDir(remixConfig.serverBuildPath),
          remixConfig.clientBuildDir,
          "package.json",
          "node_modules",
        ],
      },
    },
    metadata: {
      adapterPackageName: "firemix",
      adapterVersion,
      framework: "remix",
      frameworkVersion: remixVersion,
    },
  };

  return {
    bundle,
    remixConfig,
    warnings,
  };
}

import { dump } from "js-yaml";

/**
 * Serialize bundle to YAML string
 */
export function serializeBundle(bundle: BundleYaml): string {
  const yaml = dump(bundle, {
    lineWidth: -1, // Don't wrap lines
    quotingType: '"', // Prefer double quotes
    noRefs: true, // Don't use aliases
  });

  return `# Generated by Firemix - Firebase App Hosting adapter for Remix
# https://github.com/yhakami/firemix

${yaml}`;
}

/**
 * Generate and serialize bundle in one step (convenience function)
 */
export function generateBundleYaml(projectRoot: string, config: FiremixConfig = {}): string {
  const bundle = generateBundle(projectRoot, config);
  return serializeBundle(bundle);
}
