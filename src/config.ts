/**
 * Firemix - Remix Configuration Resolution
 * Reads and resolves Remix configuration from vite.config.ts or remix.config.js
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import type { ResolvedRemixConfig } from "./types.js";

const MAX_CONFIG_FILE_SIZE = 100 * 1024; // 100KB

/**
 * Default Remix configuration values (Vite-based)
 */
const DEFAULTS: ResolvedRemixConfig = {
  buildDirectory: "build",
  serverBuildFile: "index.js",
  serverBuildPath: "build/server/index.js",
  clientBuildDir: "build/client",
  appDirectory: "app",
};

/**
 * Check if a file exists and is not too large
 */
function safeReadFile(filePath: string): string | null {
  if (!existsSync(filePath)) {
    return null;
  }

  const stats = statSync(filePath);
  if (stats.size > MAX_CONFIG_FILE_SIZE) {
    console.warn(`Config file too large, using defaults: ${filePath}`);
    return null;
  }

  return readFileSync(filePath, "utf-8");
}

/**
 * Extract buildDirectory from vite.config.ts content using regex
 * This is a simple extraction - we're looking for common patterns
 */
function extractViteRemixConfig(content: string): Partial<ResolvedRemixConfig> {
  const config: Partial<ResolvedRemixConfig> = {};

  // Look for buildDirectory in remix() plugin options
  // Patterns: buildDirectory: "dist", buildDirectory: 'dist', buildDirectory: `dist`
  const buildDirMatch = content.match(/buildDirectory\s*:\s*["'`]([^"'`]+)["'`]/);
  if (buildDirMatch?.[1]) {
    config.buildDirectory = buildDirMatch[1];
  }

  // Look for serverBuildFile
  const serverFileMatch = content.match(/serverBuildFile\s*:\s*["'`]([^"'`]+)["'`]/);
  if (serverFileMatch?.[1]) {
    config.serverBuildFile = serverFileMatch[1];
  }

  // Look for appDirectory
  const appDirMatch = content.match(/appDirectory\s*:\s*["'`]([^"'`]+)["'`]/);
  if (appDirMatch?.[1]) {
    config.appDirectory = appDirMatch[1];
  }

  return config;
}

/**
 * Extract configuration from remix.config.js/mjs/ts (legacy)
 */
function extractLegacyRemixConfig(content: string): Partial<ResolvedRemixConfig> {
  const config: Partial<ResolvedRemixConfig> = {};

  // Legacy config uses different property names
  // serverBuildPath: "build/index.js" -> we need to parse the directory
  const serverBuildPathMatch = content.match(/serverBuildPath\s*:\s*["'`]([^"'`]+)["'`]/);
  if (serverBuildPathMatch?.[1]) {
    // Preserve the full path for legacy projects (e.g., build/index.js)
    config.serverBuildPath = serverBuildPathMatch[1];
  }

  // assetsBuildDirectory in legacy -> maps to clientBuildDir
  const assetsDirMatch = content.match(/assetsBuildDirectory\s*:\s*["'`]([^"'`]+)["'`]/);
  if (assetsDirMatch?.[1]) {
    // Legacy used "public/build" style paths
    config.clientBuildDir = assetsDirMatch[1];
  }

  // appDirectory
  const appDirMatch = content.match(/appDirectory\s*:\s*["'`]([^"'`]+)["'`]/);
  if (appDirMatch?.[1]) {
    config.appDirectory = appDirMatch[1];
  }

  return config;
}

/**
 * Validate and sanitize a directory name
 */
function sanitizeDirectoryName(name: string, fieldName: string): string {
  // Allow alphanumeric, dash, underscore, dot, and forward slash for nested paths
  const validPattern = /^[a-zA-Z0-9._/-]+$/;

  if (!validPattern.test(name)) {
    throw new Error(
      `Invalid ${fieldName}: "${name}". Only alphanumeric, dash, underscore, dot, and forward slash are allowed.`
    );
  }

  // Reject path traversal
  if (name.includes("..") || name.startsWith("/")) {
    throw new Error(
      `Invalid ${fieldName}: "${name}". Path traversal or absolute paths not allowed.`
    );
  }

  return name;
}

/**
 * Validate a relative path (may include slashes)
 */
function sanitizeRelativePath(path: string, fieldName: string): string {
  const validPattern = /^[a-zA-Z0-9._/-]+$/;

  if (!validPattern.test(path)) {
    throw new Error(
      `Invalid ${fieldName}: "${path}". Only alphanumeric, dash, underscore, dot, and forward slash are allowed.`
    );
  }

  if (path.includes("..") || path.startsWith("/") || path.includes("\\")) {
    throw new Error(
      `Invalid ${fieldName}: "${path}". Path traversal or absolute paths not allowed.`
    );
  }

  return path;
}

/**
 * Compute derived paths from the base configuration
 */
function computeDerivedPaths(config: Partial<ResolvedRemixConfig>): ResolvedRemixConfig {
  const hasExplicitBuildDir = config.buildDirectory !== undefined;
  const hasExplicitServerFile = config.serverBuildFile !== undefined;
  const hasExplicitServerPath = config.serverBuildPath !== undefined;

  const providedServerPath = hasExplicitServerPath
    ? sanitizeRelativePath(config.serverBuildPath as string, "serverBuildPath")
    : undefined;

  const buildDirectory = config.buildDirectory
    ? sanitizeDirectoryName(config.buildDirectory, "buildDirectory")
    : providedServerPath
      ? dirname(providedServerPath)
      : DEFAULTS.buildDirectory;

  const serverBuildFile = config.serverBuildFile
    ? sanitizeDirectoryName(config.serverBuildFile, "serverBuildFile")
    : providedServerPath
      ? basename(providedServerPath)
      : DEFAULTS.serverBuildFile;

  if (config.appDirectory) {
    sanitizeDirectoryName(config.appDirectory, "appDirectory");
  }

  const useProvidedServerPath =
    providedServerPath && !hasExplicitBuildDir && !hasExplicitServerFile;

  const serverBuildPath = useProvidedServerPath
    ? providedServerPath
    : `${buildDirectory}/server/${serverBuildFile}`;

  const clientBuildDir = config.clientBuildDir
    ? sanitizeRelativePath(config.clientBuildDir, "clientBuildDir")
    : `${buildDirectory}/client`;

  return {
    buildDirectory,
    serverBuildFile,
    serverBuildPath,
    clientBuildDir,
    appDirectory: config.appDirectory || DEFAULTS.appDirectory,
  };
}

/**
 * Resolve Remix configuration from project root
 *
 * Resolution order:
 * 1. vite.config.ts / vite.config.js / vite.config.mjs
 * 2. remix.config.ts / remix.config.js / remix.config.mjs (legacy)
 * 3. Default values
 */
export function resolveRemixConfig(projectRoot: string): ResolvedRemixConfig {
  let extractedConfig: Partial<ResolvedRemixConfig> = {};
  let sawViteConfig = false;
  let parsedFromViteConfig = false;

  // Try Vite config files first (modern Remix)
  const viteConfigFiles = ["vite.config.ts", "vite.config.js", "vite.config.mjs"];

  for (const configFile of viteConfigFiles) {
    const configPath = join(projectRoot, configFile);
    const content = safeReadFile(configPath);

    if (content) {
      sawViteConfig = true;
      extractedConfig = extractViteRemixConfig(content);
      if (Object.keys(extractedConfig).length > 0) {
        parsedFromViteConfig = true;
        break;
      }
    }
  }

  if (sawViteConfig && !parsedFromViteConfig) {
    console.warn(
      "Firemix could not statically read Remix options from vite.config.*. " +
        "If your Vite config is dynamic, pass buildDirectory/serverBuildFile to Firemix " +
        "or supply CLI flags."
    );
  }

  // If no Vite config found, try legacy remix.config files
  if (Object.keys(extractedConfig).length === 0) {
    const legacyConfigFiles = ["remix.config.ts", "remix.config.js", "remix.config.mjs"];

    for (const configFile of legacyConfigFiles) {
      const configPath = join(projectRoot, configFile);
      const content = safeReadFile(configPath);

      if (content) {
        extractedConfig = extractLegacyRemixConfig(content);
        if (Object.keys(extractedConfig).length > 0) {
          break;
        }
      }
    }
  }

  // Compute derived paths and apply defaults
  return computeDerivedPaths(extractedConfig);
}

/**
 * Override resolved config with user-provided options
 */
export function applyConfigOverrides(
  resolved: ResolvedRemixConfig,
  overrides: Partial<ResolvedRemixConfig>
): ResolvedRemixConfig {
  const merged: Partial<ResolvedRemixConfig> = {
    ...resolved,
    ...overrides,
  };

  // If buildDirectory is overridden but clientBuildDir is not, drop the inherited
  // clientBuildDir so it can be recomputed from the new buildDirectory.
  if (overrides.buildDirectory && overrides.clientBuildDir === undefined) {
    delete merged.clientBuildDir;
  }

  // Re-compute derived paths if buildDirectory or serverBuildFile changed
  if (overrides.buildDirectory || overrides.serverBuildFile) {
    return computeDerivedPaths(merged);
  }

  return resolved;
}
