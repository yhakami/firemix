/**
 * Firemix - Input Validation & Security
 * Sanitizes all user inputs to prevent path traversal and command injection
 */

import { isAbsolute, normalize, relative, join } from "node:path";
import { statSync, lstatSync, existsSync, mkdirSync, readFileSync } from "node:fs";

import type { RunConfig } from "./types.js";

const MAX_PACKAGE_JSON_SIZE = 100 * 1024; // 100KB (reduced from 1MB)
const MAX_DEV_DEPENDENCIES = 1000; // Reasonable upper limit to prevent DoS

interface ParsedPackageJson {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/**
 * Validate an npm package name to prevent path traversal attacks
 */
export function validatePackageName(name: string): void {
  if (!name || typeof name !== "string") {
    throw new Error("Package name must be a non-empty string");
  }

  if (name.length > 214) {
    throw new Error(`Package name too long: ${name.slice(0, 50)}...`);
  }

  // Reject path traversal attempts
  if (name.includes("..") || name.includes("/..") || name.includes("\\")) {
    throw new Error(`Invalid package name (path traversal attempt): ${name}`);
  }

  // Reject names that start with . or _ (npm restriction)
  if (name.startsWith(".") || name.startsWith("_")) {
    throw new Error(`Invalid package name (cannot start with . or _): ${name}`);
  }

  // Handle scoped packages: @scope/name
  if (name.startsWith("@")) {
    const parts = name.slice(1).split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error(`Invalid scoped package name: ${name}`);
    }
    // Validate each part
    const validPart = /^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/i;
    if (!validPart.test(parts[0]) || !validPart.test(parts[1])) {
      throw new Error(`Invalid scoped package name format: ${name}`);
    }
  } else {
    // Regular package: only alphanumeric, dash, underscore, dot
    const validPattern = /^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/i;
    if (!validPattern.test(name)) {
      throw new Error(`Invalid package name format: ${name}`);
    }
  }
}

/**
 * Check if an object is a valid dependencies map
 */
function isValidDependencyObject(obj: unknown): obj is Record<string, string> {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return false;
  }

  for (const [key, value] of Object.entries(obj)) {
    if (typeof key !== "string" || typeof value !== "string") {
      return false;
    }
  }

  return true;
}

/**
 * Safely parse package.json with prototype pollution protection
 */
export function safeParsePackageJson(pkgPath: string): ParsedPackageJson {
  checkFileSize(pkgPath);

  const content = readFileSync(pkgPath, "utf-8");
  const parsed: unknown = JSON.parse(content);

  // Validate it's an object
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Invalid package.json: must be an object");
  }

  const obj = parsed as Record<string, unknown>;

  // Reject prototype pollution attempts
  // Use Object.hasOwn to only detect actual properties, not inherited ones
  const dangerousKeys = ["__proto__", "constructor", "prototype"];
  for (const key of dangerousKeys) {
    if (Object.hasOwn(obj, key)) {
      throw new Error(`Security: package.json contains dangerous key: ${key}`);
    }
  }

  // Return only expected fields (whitelist approach)
  return {
    name: typeof obj.name === "string" ? obj.name : undefined,
    version: typeof obj.version === "string" ? obj.version : undefined,
    dependencies: isValidDependencyObject(obj.dependencies) ? obj.dependencies : undefined,
    devDependencies: isValidDependencyObject(obj.devDependencies) ? obj.devDependencies : undefined,
  };
}

/**
 * Validate and sanitize a path to prevent directory traversal attacks
 */
export function sanitizePath(userInput: string, baseDir: string): string {
  if (!userInput || typeof userInput !== "string") {
    throw new Error("Path must be a non-empty string");
  }

  // Reject absolute paths
  if (isAbsolute(userInput)) {
    throw new Error(`Absolute paths are not allowed: ${userInput}`);
  }

  // Normalize the path
  const normalized = normalize(userInput);

  // Check for directory traversal attempts
  if (normalized.startsWith("..") || normalized.includes("/..") || normalized.includes("\\..")) {
    throw new Error(`Path traversal detected: ${userInput}`);
  }

  // Ensure path stays within base directory
  const fullPath = join(baseDir, normalized);
  const relativePath = relative(baseDir, fullPath);

  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error(`Path escapes project boundary: ${userInput}`);
  }

  return normalized;
}

/**
 * Validate build directory name (strict whitelist)
 */
export function sanitizeBuildDir(buildDir: string): string {
  if (!buildDir || typeof buildDir !== "string") {
    throw new Error("Build directory must be a non-empty string");
  }

  // Only allow safe characters: alphanumeric, dash, underscore, dot
  const validPattern = /^[a-zA-Z0-9._-]+$/;

  if (!validPattern.test(buildDir)) {
    throw new Error(
      `Invalid build directory name: "${buildDir}". Only alphanumeric, dash, underscore, and dot are allowed.`
    );
  }

  // Additional checks
  if (buildDir === "." || buildDir === "..") {
    throw new Error("Build directory cannot be . or ..");
  }

  if (buildDir.startsWith(".") && buildDir !== ".output") {
    // Allow common hidden dirs like .output but warn
    console.warn(`Warning: Build directory starts with dot: ${buildDir}`);
  }

  return buildDir;
}

/**
 * Validate RunConfig numeric values
 */
export function validateRunConfig(config: Partial<RunConfig>): Required<RunConfig> {
  const defaults: Required<RunConfig> = {
    minInstances: 0,
    maxInstances: 10,
    concurrency: 80,
    cpu: 1,
    memoryMiB: 512,
  };

  const merged = { ...defaults, ...config };

  // Validate ranges
  if (merged.minInstances < 0 || merged.minInstances > 100) {
    throw new Error(`minInstances must be between 0 and 100, got: ${merged.minInstances}`);
  }

  if (merged.maxInstances < 1 || merged.maxInstances > 1000) {
    throw new Error(`maxInstances must be between 1 and 1000, got: ${merged.maxInstances}`);
  }

  if (merged.minInstances > merged.maxInstances) {
    throw new Error(`minInstances (${merged.minInstances}) cannot exceed maxInstances (${merged.maxInstances})`);
  }

  if (merged.concurrency < 1 || merged.concurrency > 1000) {
    throw new Error(`concurrency must be between 1 and 1000, got: ${merged.concurrency}`);
  }

  if (merged.cpu < 1 || merged.cpu > 8) {
    throw new Error(`cpu must be between 1 and 8, got: ${merged.cpu}`);
  }

  if (merged.memoryMiB < 128 || merged.memoryMiB > 32768) {
    throw new Error(`memoryMiB must be between 128 and 32768, got: ${merged.memoryMiB}`);
  }

  // Ensure all values are integers
  return {
    minInstances: Math.floor(merged.minInstances),
    maxInstances: Math.floor(merged.maxInstances),
    concurrency: Math.floor(merged.concurrency),
    cpu: Math.floor(merged.cpu),
    memoryMiB: Math.floor(merged.memoryMiB),
  };
}

/**
 * Check file size before reading
 */
export function checkFileSize(filePath: string, maxSize: number = MAX_PACKAGE_JSON_SIZE): void {
  const stats = statSync(filePath);
  if (stats.size > maxSize) {
    throw new Error(`File exceeds maximum size of ${maxSize} bytes: ${filePath}`);
  }
}

/**
 * Create directory securely (prevent symlink attacks)
 */
export function createSecureDirectory(dirPath: string): void {
  if (existsSync(dirPath)) {
    const stats = lstatSync(dirPath);

    // Reject symlinks (prevent TOCTOU attacks)
    if (stats.isSymbolicLink()) {
      throw new Error(`Security: ${dirPath} is a symbolic link`);
    }

    // Verify it's a directory
    if (!stats.isDirectory()) {
      throw new Error(`${dirPath} exists but is not a directory`);
    }

    return;
  }

  // Create with secure permissions (755)
  mkdirSync(dirPath, {
    recursive: true,
    mode: 0o755,
  });

  // Verify creation succeeded and is not a symlink
  const stats = lstatSync(dirPath);
  if (stats.isSymbolicLink()) {
    throw new Error(`Security: Race condition detected - ${dirPath} became a symlink`);
  }
}

/**
 * Validate that a directory looks like a Remix project
 */
export function validateRemixProject(projectRoot: string): void {
  const packageJsonPath = join(projectRoot, "package.json");

  if (!existsSync(packageJsonPath)) {
    throw new Error("No package.json found. Is this a Remix project?");
  }

  const stats = lstatSync(packageJsonPath);

  if (stats.isSymbolicLink()) {
    throw new Error("Security: package.json must not be a symlink");
  }

  if (!stats.isFile()) {
    throw new Error("Security: package.json is not a file");
  }

  // Check file size
  checkFileSize(packageJsonPath);
}

/**
 * Resolve the node_modules path for a package (handles scoped packages)
 */
function getNodeModulesPath(projectRoot: string, packageName: string): string {
  // Scoped packages: @scope/name -> node_modules/@scope/name
  // Regular packages: name -> node_modules/name
  return join(projectRoot, "node_modules", packageName);
}

/**
 * Ensure devDependencies are not installed to avoid bundling build/test tooling.
 */
export function assertNoDevDependenciesInstalled(projectRoot: string, allowDevDependencies?: boolean): void {
  // Validate type at runtime
  if (allowDevDependencies !== undefined && typeof allowDevDependencies !== "boolean") {
    throw new Error(`allowDevDependencies must be a boolean, got: ${typeof allowDevDependencies}`);
  }

  if (allowDevDependencies === true) {
    console.warn(
      "⚠️  WARNING: allowDevDependencies=true - Skipping devDependencies check.\n" +
        "   Development packages may be bundled. Only use this flag for testing."
    );
    return;
  }

  const pkgPath = join(projectRoot, "package.json");
  const pkg = safeParsePackageJson(pkgPath);

  const devDeps = Object.keys(pkg.devDependencies ?? {});
  if (devDeps.length === 0) return;

  // Prevent DoS via excessive dependencies
  if (devDeps.length > MAX_DEV_DEPENDENCIES) {
    throw new Error(
      `Security: Too many devDependencies (${devDeps.length} > ${MAX_DEV_DEPENDENCIES}). ` +
        `This may indicate a malicious package.json.`
    );
  }

  // Validate all package names first (prevent path traversal)
  for (const dep of devDeps) {
    validatePackageName(dep);
  }

  const devPresent = devDeps.filter((dep) => {
    const depPath = getNodeModulesPath(projectRoot, dep);

    // Defense in depth: verify path didn't escape
    const nodeModulesBase = join(projectRoot, "node_modules");
    if (!depPath.startsWith(nodeModulesBase)) {
      throw new Error(`Security: package path escaped node_modules: ${dep}`);
    }

    if (!existsSync(depPath)) return false;

    // Use lstatSync to detect symlinks (prevent TOCTOU attacks)
    const stats = lstatSync(depPath);
    if (stats.isSymbolicLink()) {
      throw new Error(`Security: devDependency '${dep}' is a symlink - potential attack vector`);
    }

    return true;
  });

  if (devPresent.length > 0) {
    const count = devPresent.length;
    throw new Error(
      `Security: ${count} devDependenc${count === 1 ? "y" : "ies"} present in node_modules. ` +
        `Run "npm ci --omit=dev" before bundling or set allowDevDependencies=true.`
    );
  }
}
