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
   */
  buildDir?: string;
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

export interface RemixConfig {
  buildDirectory?: string;
  serverBuildPath?: string;
  assetsBuildDirectory?: string;
}
