/**
 * Firemix - Firebase App Hosting adapter for Remix
 * Type definitions
 */

export interface FiremixConfig {
  /**
   * Output directory for the bundle (default: ".apphosting")
   */
  outputDir?: string;

  /**
   * Cloud Run configuration
   */
  runConfig?: RunConfig;

  /**
   * Remix build output directory (default: "build")
   * @deprecated Use buildDirectory instead
   */
  buildDir?: string;

  /**
   * Remix build output directory (default: "build")
   * Maps to Remix's buildDirectory option
   */
  buildDirectory?: string;

  /**
   * Override the server entry file name (default: "index.js")
   * Maps to Remix's serverBuildFile option
   */
  serverBuildFile?: string;

  /**
   * Override the run command for Cloud Run
   * Default: "node_modules/.bin/remix-serve ${buildDirectory}/server/${serverBuildFile}"
   */
  runCommand?: string;

  /**
   * Permit packaging when devDependencies are present in node_modules.
   * Defaults to false to avoid deploying development tooling.
   */
  allowDevDependencies?: boolean;

  /**
   * Allow symlinked packages in node_modules.
   * Can be true to allow all symlinks, or an array of package names to allow.
   * Useful for local development with linked packages (e.g., file: references).
   * Defaults to false for security.
   */
  allowSymlinks?: boolean | string[];

  /**
   * Verify build output exists before generating bundle.
   * Defaults to true.
   */
  verify?: boolean;
}

export interface RunConfig {
  /**
   * Minimum number of instances (default: 0 for scale-to-zero)
   */
  minInstances?: number;

  /**
   * Maximum number of instances (default: 10)
   */
  maxInstances?: number;

  /**
   * Concurrent requests per instance (default: 80)
   */
  concurrency?: number;

  /**
   * CPU allocation (default: 1)
   */
  cpu?: number;

  /**
   * Memory in MiB (default: 512)
   */
  memoryMiB?: number;
}

export interface BundleYaml {
  version: "v1";
  runConfig: {
    runCommand: string;
    concurrency: number;
    cpu: number;
    memoryMiB: number;
    minInstances: number;
    maxInstances: number;
  };
  outputFiles: {
    serverApp: {
      include: string[];
    };
    staticAssets?: {
      include: string[];
    };
  };
  metadata: {
    adapterPackageName: string;
    adapterVersion: string;
    framework: string;
    frameworkVersion?: string;
  };
}

/**
 * Remix configuration as read from vite.config.ts or remix.config.js
 * @deprecated Use ResolvedRemixConfig instead
 */
export interface RemixConfig {
  buildDirectory?: string;
  serverBuildPath?: string;
  assetsBuildDirectory?: string;
}

/**
 * Fully resolved Remix configuration with computed paths
 */
export interface ResolvedRemixConfig {
  /**
   * Base build output directory (default: "build")
   */
  buildDirectory: string;

  /**
   * Server entry file name (default: "index.js")
   */
  serverBuildFile: string;

  /**
   * Full path to server entry (computed: "${buildDirectory}/server/${serverBuildFile}")
   */
  serverBuildPath: string;

  /**
   * Client assets directory (computed: "${buildDirectory}/client")
   */
  clientBuildDir: string;

  /**
   * Application source directory (default: "app")
   */
  appDirectory: string;
}

/**
 * Environment variable configuration for Cloud Run
 */
export interface EnvVarConfig {
  /**
   * Environment variable name
   */
  variable: string;

  /**
   * Variable value
   */
  value: string;

  /**
   * Availability context
   */
  availability: "RUNTIME" | "BUILD" | "BUILD_AND_RUNTIME";
}
