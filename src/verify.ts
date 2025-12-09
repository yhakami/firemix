/**
 * Firemix - Build Output Verification
 * Verifies that Remix build output exists and is valid before bundle generation
 */

import { existsSync, lstatSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import type { ResolvedRemixConfig } from "./types.js";

/**
 * Result of build verification
 */
export interface BuildVerificationResult {
  /** Whether the build output is valid */
  valid: boolean;
  /** Critical errors that prevent bundle generation */
  errors: string[];
  /** Non-critical warnings */
  warnings: string[];
  /** Resolved server entry path (if valid) */
  serverEntry?: string;
  /** Resolved client directory (if valid) */
  clientDir?: string;
  /** Whether node_modules exists */
  hasNodeModules: boolean;
  /** Whether package.json exists */
  hasPackageJson: boolean;
}

/**
 * Check if a path is a symlink
 */
function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Check if a directory is empty or only contains hidden files
 */
function isEmptyDirectory(dirPath: string): boolean {
  try {
    const files = readdirSync(dirPath).filter((f) => !f.startsWith("."));
    return files.length === 0;
  } catch {
    return true;
  }
}

/**
 * Verify that Remix build output exists and is valid
 *
 * @param projectRoot - Project root directory
 * @param config - Resolved Remix configuration
 * @returns Verification result with errors and warnings
 */
export function verifyBuildOutput(
  projectRoot: string,
  config: ResolvedRemixConfig
): BuildVerificationResult {
  const result: BuildVerificationResult = {
    valid: true,
    errors: [],
    warnings: [],
    hasNodeModules: false,
    hasPackageJson: false,
  };

  // 1. Check server entry point
  const serverEntryPath = join(projectRoot, config.serverBuildPath);

  if (!existsSync(serverEntryPath)) {
    result.valid = false;
    result.errors.push(
      `Server entry point not found: ${config.serverBuildPath}\n` +
        `  Expected: ${serverEntryPath}\n` +
        `  Run 'npm run build' or 'remix build' first.`
    );
  } else if (isSymlink(serverEntryPath)) {
    result.valid = false;
    result.errors.push(`Security: Server entry point is a symlink: ${config.serverBuildPath}`);
  } else {
    const stats = statSync(serverEntryPath);
    if (!stats.isFile()) {
      result.valid = false;
      result.errors.push(`Server entry point is not a file: ${config.serverBuildPath}`);
    } else if (stats.size === 0) {
      result.valid = false;
      result.errors.push(`Server entry point is empty: ${config.serverBuildPath}`);
    } else {
      result.serverEntry = serverEntryPath;
    }
  }

  // 2. Check client assets directory
  const clientDirPath = join(projectRoot, config.clientBuildDir);

  if (!existsSync(clientDirPath)) {
    result.valid = false;
    result.errors.push(
      `Client assets directory not found: ${config.clientBuildDir}\n` +
        `  Expected: ${clientDirPath}\n` +
        `  Run 'npm run build' or 'remix build' first.`
    );
  } else if (isSymlink(clientDirPath)) {
    result.valid = false;
    result.errors.push(`Security: Client assets directory is a symlink: ${config.clientBuildDir}`);
  } else {
    const stats = lstatSync(clientDirPath);
    if (!stats.isDirectory()) {
      result.valid = false;
      result.errors.push(`Client assets path is not a directory: ${config.clientBuildDir}`);
    } else if (isEmptyDirectory(clientDirPath)) {
      result.warnings.push(`Client assets directory is empty: ${config.clientBuildDir}`);
      result.clientDir = clientDirPath;
    } else {
      result.clientDir = clientDirPath;
    }
  }

  // 3. Check server directory exists (contains more than just index.js sometimes)
  const serverDirRelative = config.serverBuildPath.includes("/")
    ? config.serverBuildPath.slice(0, config.serverBuildPath.lastIndexOf("/"))
    : ".";
  const serverDirPath = join(projectRoot, serverDirRelative);

  if (!existsSync(serverDirPath)) {
    result.valid = false;
    result.errors.push(
      `Server build directory not found: ${serverDirRelative}\n` + `  Expected: ${serverDirPath}`
    );
  } else if (isSymlink(serverDirPath)) {
    result.valid = false;
    result.errors.push(`Security: Server directory is a symlink: ${serverDirRelative}`);
  }

  // 4. Check package.json exists
  const packageJsonPath = join(projectRoot, "package.json");

  if (!existsSync(packageJsonPath)) {
    result.valid = false;
    result.errors.push("package.json not found in project root");
  } else if (isSymlink(packageJsonPath)) {
    result.valid = false;
    result.errors.push("Security: package.json is a symlink");
  } else {
    result.hasPackageJson = true;
  }

  // 5. Check node_modules exists (warning only, might be installed later)
  const nodeModulesPath = join(projectRoot, "node_modules");

  if (!existsSync(nodeModulesPath)) {
    result.warnings.push(
      "node_modules not found. Dependencies will need to be installed before deployment."
    );
  } else if (isSymlink(nodeModulesPath)) {
    result.warnings.push("node_modules is a symlink. This may cause issues with deployment.");
    result.hasNodeModules = true;
  } else {
    result.hasNodeModules = true;
  }

  // 6. Check for common build artifacts that shouldn't be deployed
  const problematicPaths = [".env", ".env.local", ".env.development", ".env.development.local"];

  for (const problematic of problematicPaths) {
    const checkPath = join(projectRoot, config.buildDirectory, problematic);
    if (existsSync(checkPath)) {
      result.warnings.push(
        `Found ${problematic} in build output. This file should not be deployed.`
      );
    }
  }

  return result;
}

/**
 * Format verification result as a human-readable string
 */
export function formatVerificationResult(result: BuildVerificationResult): string {
  const lines: string[] = [];

  if (result.valid) {
    lines.push("✅ Build verification passed");
  } else {
    lines.push("❌ Build verification failed");
  }

  if (result.errors.length > 0) {
    lines.push("\nErrors:");
    for (const error of result.errors) {
      lines.push(`  • ${error.split("\n").join("\n    ")}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push("\nWarnings:");
    for (const warning of result.warnings) {
      lines.push(`  ⚠ ${warning}`);
    }
  }

  if (result.valid) {
    lines.push("\nVerified paths:");
    if (result.serverEntry) {
      lines.push(`  • Server: ${result.serverEntry}`);
    }
    if (result.clientDir) {
      lines.push(`  • Client: ${result.clientDir}`);
    }
    lines.push(`  • package.json: ${result.hasPackageJson ? "found" : "missing"}`);
    lines.push(`  • node_modules: ${result.hasNodeModules ? "found" : "missing"}`);
  }

  return lines.join("\n");
}

/**
 * Quick check if a build exists (less thorough than full verification)
 */
export function buildExists(projectRoot: string, config: ResolvedRemixConfig): boolean {
  const serverEntryPath = join(projectRoot, config.serverBuildPath);
  const clientDirPath = join(projectRoot, config.clientBuildDir);

  return existsSync(serverEntryPath) && existsSync(clientDirPath);
}
