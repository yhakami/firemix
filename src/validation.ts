/**
 * Firemix - Input Validation & Security
 * Sanitizes all user inputs to prevent path traversal and command injection
 */

import { isAbsolute, normalize, relative, join } from "node:path";
import { statSync, lstatSync, existsSync, mkdirSync } from "node:fs";

import type { RunConfig } from "./types.js";

const MAX_PACKAGE_JSON_SIZE = 1024 * 1024; // 1MB

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

  // Check file size
  checkFileSize(packageJsonPath);
}
