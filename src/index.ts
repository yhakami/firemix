/**
 * Firemix - Firebase App Hosting adapter for Remix
 *
 * @packageDocumentation
 */

export { generateBundle, serializeBundle } from "./bundle.js";
export { firemix } from "./vite.js";
export type {
  BundleYaml,
  FiremixConfig,
  RemixConfig,
  RunConfig,
} from "./types.js";
