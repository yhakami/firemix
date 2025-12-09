/**
 * Firemix - Firebase App Hosting adapter for Remix
 *
 * @packageDocumentation
 */

// Core bundle generation
export {
  generateBundle,
  generateBundleWithMetadata,
  generateBundleYaml,
  serializeBundle,
} from "./bundle.js";
export type { GenerateBundleResult } from "./bundle.js";

// Vite plugin
export { firemix } from "./vite.js";
export type { FiremixPluginOptions } from "./vite.js";

// Configuration resolution
export { resolveRemixConfig, applyConfigOverrides } from "./config.js";

// Version utilities
export {
  getResolvedRemixVersion,
  getResolvedPackageVersion,
  getAdapterVersion,
  getVersionInfo,
} from "./version.js";
export type { VersionInfo } from "./version.js";

// Build verification
export { verifyBuildOutput, formatVerificationResult, buildExists } from "./verify.js";
export type { BuildVerificationResult } from "./verify.js";

// Type exports
export type {
  BundleYaml,
  FiremixConfig,
  ResolvedRemixConfig,
  RemixConfig,
  RunConfig,
  EnvVarConfig,
} from "./types.js";
