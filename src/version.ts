/**
 * Firemix - Version Resolution
 * Resolves actual installed package versions from node_modules
 */

import { existsSync, readFileSync, statSync, lstatSync } from "node:fs";
import { join } from "node:path";

const MAX_PACKAGE_JSON_SIZE = 50 * 1024; // 50KB

function logWarn(message: string): void {
  if (process.env.NODE_ENV !== "test") {
    console.warn(message);
  }
}

/**
 * Safely read and parse a package.json file
 */
function safeReadPackageJson(pkgPath: string): { version?: string } | null {
  if (!existsSync(pkgPath)) {
    return null;
  }

  // Security: Check for symlinks
  const lstat = lstatSync(pkgPath);
  if (lstat.isSymbolicLink()) {
    logWarn(`Skipping symlinked package.json: ${pkgPath}`);
    return null;
  }

  // Security: Check file size
  const stats = statSync(pkgPath);
  if (stats.size > MAX_PACKAGE_JSON_SIZE) {
    logWarn(`Package.json too large, skipping: ${pkgPath}`);
    return null;
  }

  try {
    const content = readFileSync(pkgPath, "utf-8");
    const parsed: unknown = JSON.parse(content);

    // Validate it's an object
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }

    const obj = parsed as Record<string, unknown>;

    // Only extract version field
    return {
      version: typeof obj.version === "string" ? obj.version : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Get the resolved version of a package from node_modules
 *
 * This reads the actual installed version, not the semver range from package.json
 *
 * @param projectRoot - Project root directory
 * @param packageName - Package name (e.g., "@remix-run/node")
 * @returns Resolved version string or undefined
 */
export function getResolvedPackageVersion(
  projectRoot: string,
  packageName: string
): string | undefined {
  // Validate package name to prevent path traversal
  if (!packageName || typeof packageName !== "string") {
    return undefined;
  }

  // Reject path traversal attempts
  if (packageName.includes("..") || packageName.includes("\\")) {
    logWarn(`Invalid package name: ${packageName}`);
    return undefined;
  }

  const pkgPath = join(projectRoot, "node_modules", packageName, "package.json");

  // Security: Verify path is within node_modules
  const nodeModulesBase = join(projectRoot, "node_modules");
  if (!pkgPath.startsWith(nodeModulesBase)) {
    logWarn(`Package path escapes node_modules: ${packageName}`);
    return undefined;
  }

  const pkg = safeReadPackageJson(pkgPath);
  return pkg?.version;
}

/**
 * Get the resolved Remix version from node_modules
 *
 * Tries multiple Remix packages in order of preference:
 * 1. @remix-run/node - Most commonly used in SSR
 * 2. @remix-run/react - Core React integration
 * 3. @remix-run/dev - Development tooling
 *
 * @param projectRoot - Project root directory
 * @returns Resolved Remix version or undefined
 */
export function getResolvedRemixVersion(projectRoot: string): string | undefined {
  const remixPackages = [
    "@remix-run/node",
    "@remix-run/react",
    "@remix-run/dev",
    "@remix-run/serve",
    "@remix-run/express",
  ];

  for (const pkg of remixPackages) {
    const version = getResolvedPackageVersion(projectRoot, pkg);
    if (version) {
      return version;
    }
  }

  return undefined;
}

/**
 * Get the adapter version from its own package.json
 */
export function getAdapterVersion(adapterRoot: string): string {
  const pkgPath = join(adapterRoot, "package.json");
  const pkg = safeReadPackageJson(pkgPath);
  return pkg?.version || "0.0.0";
}

/**
 * Validate that a version string looks like a semver version
 * (not a range like ^2.0.0 or ~1.0.0)
 */
export function isResolvedVersion(version: string): boolean {
  // Resolved versions should be like "2.8.1" not "^2.8.1"
  // Allow: 2.8.1, 2.8.1-beta.1, 2.8.1-rc.0
  // Reject: ^2.8.1, ~2.8.1, >=2.8.1, 2.x, *
  const resolvedPattern = /^\d+\.\d+\.\d+(-[\w.]+)?$/;
  return resolvedPattern.test(version);
}

/**
 * Get version information for diagnostic purposes
 */
export interface VersionInfo {
  remix?: string;
  adapter: string;
  node: string;
}

export function getVersionInfo(projectRoot: string, adapterRoot: string): VersionInfo {
  return {
    remix: getResolvedRemixVersion(projectRoot),
    adapter: getAdapterVersion(adapterRoot),
    node: process.version,
  };
}
