import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it, afterEach } from "vitest";

import { generateBundle, generateBundleWithMetadata, serializeBundle } from "./bundle.js";
import type { BundleYaml } from "./types.js";

function makeTempProject(structure: Record<string, string | null>): string {
  const root = mkdtempSync(join(tmpdir(), "firemix-bundle-"));

  for (const [path, content] of Object.entries(structure)) {
    const fullPath = join(root, path);
    const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));

    if (dir) {
      mkdirSync(dir, { recursive: true });
    }

    if (content === null) {
      mkdirSync(fullPath, { recursive: true });
    } else {
      writeFileSync(fullPath, content, "utf-8");
    }
  }

  return root;
}

describe("generateBundle", () => {
  let projectRoot: string;

  afterEach(() => {
    if (projectRoot) {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("generates bundle with default paths", () => {
    projectRoot = makeTempProject({
      "package.json": JSON.stringify({
        name: "test-remix-app",
        dependencies: {
          "@remix-run/node": "2.8.1",
        },
      }),
      "build/server/index.js": "// server entry",
      "build/client/assets/main.js": "// client assets",
    });

    const bundle = generateBundle(projectRoot, {
      allowDevDependencies: true, // Skip dev deps check for test
    });

    expect(bundle.version).toBe("v1");
    expect(bundle.runConfig.runCommand).toBe("node_modules/.bin/remix-serve build/server/index.js");
    expect(bundle.outputFiles.serverApp.include).toContain("build/server");
    expect(bundle.outputFiles.serverApp.include).toContain("package.json");
    expect(bundle.outputFiles.serverApp.include).toContain("node_modules");
    expect(bundle.outputFiles.staticAssets?.include).toContain("build/client");
    expect(bundle.metadata.framework).toBe("remix");
    expect(bundle.metadata.adapterPackageName).toBe("firemix");
  });

  it("respects custom build directory from vite.config.ts", () => {
    projectRoot = makeTempProject({
      "package.json": JSON.stringify({ name: "test" }),
      "vite.config.ts": `
        export default {
          plugins: [remix({ buildDirectory: "dist" })],
        };
      `,
      "dist/server/index.js": "// server entry",
      "dist/client/assets/main.js": "// client assets",
    });

    const bundle = generateBundle(projectRoot, {
      allowDevDependencies: true,
    });

    expect(bundle.runConfig.runCommand).toBe("node_modules/.bin/remix-serve dist/server/index.js");
    expect(bundle.outputFiles.serverApp.include).toContain("dist/server");
    expect(bundle.outputFiles.staticAssets?.include).toContain("dist/client");
  });

  it("respects buildDirectory option override", () => {
    projectRoot = makeTempProject({
      "package.json": JSON.stringify({ name: "test" }),
      "custom/server/index.js": "// server entry",
      "custom/client/assets/main.js": "// client assets",
    });

    const bundle = generateBundle(projectRoot, {
      buildDirectory: "custom",
      allowDevDependencies: true,
    });

    expect(bundle.runConfig.runCommand).toBe("node_modules/.bin/remix-serve custom/server/index.js");
    expect(bundle.outputFiles.serverApp.include).toContain("custom/server");
    expect(bundle.outputFiles.staticAssets?.include).toContain("custom/client");
  });

  it("honors legacy remix.config serverBuildPath and assetsBuildDirectory", () => {
    projectRoot = makeTempProject({
      "package.json": JSON.stringify({ name: "test" }),
      "remix.config.js": `
        module.exports = {
          serverBuildPath: "build/index.js",
          assetsBuildDirectory: "public/build",
        };
      `,
      "build/index.js": "// legacy server entry",
      "public/build/main.js": "// client asset",
      "node_modules/.keep": "",
    });

    const bundle = generateBundle(projectRoot, {
      allowDevDependencies: true,
    });

    expect(bundle.runConfig.runCommand).toBe("node_modules/.bin/remix-serve build/index.js");
    expect(bundle.outputFiles.serverApp.include).toContain("build");
    expect(bundle.outputFiles.staticAssets?.include).toContain("public/build");
  });

  it("supports custom run command", () => {
    projectRoot = makeTempProject({
      "package.json": JSON.stringify({ name: "test" }),
      "build/server/index.js": "// server entry",
      "build/client/assets/main.js": "// client assets",
    });

    const bundle = generateBundle(projectRoot, {
      runCommand: "deno run --allow-all build/server/index.js",
      allowDevDependencies: true,
    });

    expect(bundle.runConfig.runCommand).toBe("deno run --allow-all build/server/index.js");
  });

  it("applies custom runConfig values", () => {
    projectRoot = makeTempProject({
      "package.json": JSON.stringify({ name: "test" }),
      "build/server/index.js": "// server entry",
      "build/client/assets/main.js": "// client assets",
    });

    const bundle = generateBundle(projectRoot, {
      runConfig: {
        minInstances: 1,
        maxInstances: 20,
        concurrency: 100,
        cpu: 2,
        memoryMiB: 1024,
      },
      allowDevDependencies: true,
    });

    expect(bundle.runConfig.minInstances).toBe(1);
    expect(bundle.runConfig.maxInstances).toBe(20);
    expect(bundle.runConfig.concurrency).toBe(100);
    expect(bundle.runConfig.cpu).toBe(2);
    expect(bundle.runConfig.memoryMiB).toBe(1024);
  });

  it("fails when build output is missing", () => {
    projectRoot = makeTempProject({
      "package.json": JSON.stringify({ name: "test" }),
    });

    expect(() => generateBundle(projectRoot, { allowDevDependencies: true })).toThrow(
      /Build verification failed/
    );
  });

  it("skips verification when verify is false", () => {
    projectRoot = makeTempProject({
      "package.json": JSON.stringify({ name: "test" }),
      // No build output
    });

    // Should not throw
    const bundle = generateBundle(projectRoot, {
      verify: false,
      allowDevDependencies: true,
    });

    expect(bundle.version).toBe("v1");
  });
});

describe("generateBundleWithMetadata", () => {
  let projectRoot: string;

  afterEach(() => {
    if (projectRoot) {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("returns warnings when Remix version cannot be resolved", () => {
    projectRoot = makeTempProject({
      "package.json": JSON.stringify({ name: "test" }),
      "build/server/index.js": "// server entry",
      "build/client/assets/main.js": "// client assets",
    });

    const { bundle, warnings } = generateBundleWithMetadata(projectRoot, {
      allowDevDependencies: true,
    });

    expect(bundle.metadata.frameworkVersion).toBeUndefined();
    expect(warnings.some((w) => w.includes("Could not resolve Remix version"))).toBe(true);
  });

  it("resolves Remix version from node_modules", () => {
    projectRoot = makeTempProject({
      "package.json": JSON.stringify({
        name: "test",
        dependencies: { "@remix-run/node": "^2.8.0" }, // semver range
      }),
      "build/server/index.js": "// server entry",
      "build/client/assets/main.js": "// client assets",
      "node_modules/@remix-run/node/package.json": JSON.stringify({
        name: "@remix-run/node",
        version: "2.8.1", // resolved version
      }),
    });

    const { bundle, warnings } = generateBundleWithMetadata(projectRoot, {
      allowDevDependencies: true,
    });

    // Should resolve the actual version from node_modules, not the range
    expect(bundle.metadata.frameworkVersion).toBe("2.8.1");
    expect(warnings.some((w) => w.includes("Could not resolve Remix version"))).toBe(false);
  });

  it("returns resolved Remix config", () => {
    projectRoot = makeTempProject({
      "package.json": JSON.stringify({ name: "test" }),
      "vite.config.ts": `
        export default {
          plugins: [remix({ buildDirectory: "dist" })],
        };
      `,
      "dist/server/index.js": "// server entry",
      "dist/client/assets/main.js": "// client assets",
    });

    const { remixConfig } = generateBundleWithMetadata(projectRoot, {
      allowDevDependencies: true,
    });

    expect(remixConfig.buildDirectory).toBe("dist");
    expect(remixConfig.serverBuildPath).toBe("dist/server/index.js");
    expect(remixConfig.clientBuildDir).toBe("dist/client");
  });
});

import { load } from "js-yaml";

describe("serializeBundle", () => {
  it("produces valid YAML structure", () => {
    const bundle = {
      version: "v1" as const,
      runConfig: {
        runCommand: "node_modules/.bin/remix-serve build/server/index.js",
        concurrency: 80,
        cpu: 1,
        memoryMiB: 512,
        minInstances: 0,
        maxInstances: 10,
      },
      outputFiles: {
        serverApp: {
          include: ["build/server", "package.json", "node_modules"],
        },
        staticAssets: {
          include: ["build/client"],
        },
      },
      metadata: {
        adapterPackageName: "firemix",
        adapterVersion: "0.1.1",
        framework: "remix",
        frameworkVersion: "2.8.1",
      },
    };

    const yaml = serializeBundle(bundle);
    const parsed = load(yaml) as BundleYaml;

    expect(parsed.version).toBe("v1");
    expect(parsed.runConfig.runCommand).toBe("node_modules/.bin/remix-serve build/server/index.js");
    expect(parsed.runConfig.concurrency).toBe(80);
    expect(parsed.runConfig.cpu).toBe(1);
    expect(parsed.runConfig.memoryMiB).toBe(512);
    expect(parsed.runConfig.minInstances).toBe(0);
    expect(parsed.runConfig.maxInstances).toBe(10);
    expect(parsed.outputFiles.serverApp.include).toEqual([
      "build/server",
      "package.json",
      "node_modules",
    ]);
    expect(parsed.outputFiles.staticAssets?.include).toEqual(["build/client"]);
    expect(parsed.metadata.adapterPackageName).toBe("firemix");
    expect(parsed.metadata.framework).toBe("remix");
    expect(parsed.metadata.frameworkVersion).toBe("2.8.1");
  });

  it("handles special characters in keys or values safely", () => {
    const bundle = {
      version: "v1" as const,
      runConfig: {
        runCommand: "node_modules/.bin/remix-serve build/server/index.js",
        concurrency: 80,
        cpu: 1,
        memoryMiB: 512,
        minInstances: 0,
        maxInstances: 10,
      },
      outputFiles: {
        serverApp: {
          include: ["path with spaces", "path:with:colons", "path'with'quotes"],
        },
      },
      metadata: {
        adapterPackageName: "firemix",
        adapterVersion: "0.1.1",
        framework: "remix",
      },
    };

    const yaml = serializeBundle(bundle);
    const parsed = load(yaml) as BundleYaml;

    expect(parsed.outputFiles.serverApp.include).toContain("path with spaces");
    expect(parsed.outputFiles.serverApp.include).toContain("path:with:colons");
    expect(parsed.outputFiles.serverApp.include).toContain("path'with'quotes");
  });

  it("omits frameworkVersion when undefined", () => {
    const bundle = {
      version: "v1" as const,
      runConfig: {
        runCommand: "node_modules/.bin/remix-serve build/server/index.js",
        concurrency: 80,
        cpu: 1,
        memoryMiB: 512,
        minInstances: 0,
        maxInstances: 10,
      },
      outputFiles: {
        serverApp: {
          include: ["build/server"],
        },
      },
      metadata: {
        adapterPackageName: "firemix",
        adapterVersion: "0.1.1",
        framework: "remix",
        frameworkVersion: undefined,
      },
    };

    const yaml = serializeBundle(bundle);
    const parsed = load(yaml) as BundleYaml;

    expect(parsed.metadata.frameworkVersion).toBeUndefined();
  });
});
