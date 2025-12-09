import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it, afterEach } from "vitest";

import { verifyBuildOutput, formatVerificationResult, buildExists } from "./verify.js";
import type { ResolvedRemixConfig } from "./types.js";

const DEFAULT_CONFIG: ResolvedRemixConfig = {
  buildDirectory: "build",
  serverBuildFile: "index.js",
  serverBuildPath: "build/server/index.js",
  clientBuildDir: "build/client",
  appDirectory: "app",
};

function makeTempProject(structure: Record<string, string | null>): string {
  const root = mkdtempSync(join(tmpdir(), "firemix-verify-"));

  for (const [path, content] of Object.entries(structure)) {
    const fullPath = join(root, path);
    const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));

    if (dir) {
      mkdirSync(dir, { recursive: true });
    }

    if (content === null) {
      // Directory marker
      mkdirSync(fullPath, { recursive: true });
    } else {
      writeFileSync(fullPath, content, "utf-8");
    }
  }

  return root;
}

describe("verifyBuildOutput", () => {
  let projectRoot: string;

  afterEach(() => {
    if (projectRoot) {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("passes when all required files exist", () => {
    projectRoot = makeTempProject({
      "package.json": JSON.stringify({ name: "test" }),
      "build/server/index.js": "// server entry",
      "build/client/assets/main.js": "// client assets",
      "node_modules/.package-lock.json": "{}",
    });

    const result = verifyBuildOutput(projectRoot, DEFAULT_CONFIG);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.hasPackageJson).toBe(true);
    expect(result.hasNodeModules).toBe(true);
    expect(result.serverEntry).toBe(join(projectRoot, "build/server/index.js"));
    expect(result.clientDir).toBe(join(projectRoot, "build/client"));
  });

  it("fails when server entry point is missing", () => {
    projectRoot = makeTempProject({
      "package.json": JSON.stringify({ name: "test" }),
      "build/client/assets/main.js": "// client assets",
    });

    const result = verifyBuildOutput(projectRoot, DEFAULT_CONFIG);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Server entry point not found"))).toBe(true);
  });

  it("fails when client directory is missing", () => {
    projectRoot = makeTempProject({
      "package.json": JSON.stringify({ name: "test" }),
      "build/server/index.js": "// server entry",
    });

    const result = verifyBuildOutput(projectRoot, DEFAULT_CONFIG);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Client assets directory not found"))).toBe(true);
  });

  it("fails when server entry is empty", () => {
    projectRoot = makeTempProject({
      "package.json": JSON.stringify({ name: "test" }),
      "build/server/index.js": "",
      "build/client/assets/main.js": "// client assets",
    });

    const result = verifyBuildOutput(projectRoot, DEFAULT_CONFIG);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Server entry point is empty"))).toBe(true);
  });

  it("fails when package.json is missing", () => {
    projectRoot = makeTempProject({
      "build/server/index.js": "// server entry",
      "build/client/assets/main.js": "// client assets",
    });

    const result = verifyBuildOutput(projectRoot, DEFAULT_CONFIG);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("package.json not found"))).toBe(true);
  });

  it("warns when node_modules is missing", () => {
    projectRoot = makeTempProject({
      "package.json": JSON.stringify({ name: "test" }),
      "build/server/index.js": "// server entry",
      "build/client/assets/main.js": "// client assets",
    });

    const result = verifyBuildOutput(projectRoot, DEFAULT_CONFIG);

    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes("node_modules not found"))).toBe(true);
    expect(result.hasNodeModules).toBe(false);
  });

  it("warns when client directory is empty", () => {
    projectRoot = makeTempProject({
      "package.json": JSON.stringify({ name: "test" }),
      "build/server/index.js": "// server entry",
      "build/client": null, // Directory marker
      "node_modules/.keep": "",
    });

    const result = verifyBuildOutput(projectRoot, DEFAULT_CONFIG);

    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes("Client assets directory is empty"))).toBe(true);
  });

  it("fails when server entry is a symlink", () => {
    projectRoot = makeTempProject({
      "package.json": JSON.stringify({ name: "test" }),
      "build/server": null,
      "build/client/assets/main.js": "// client assets",
      "real-server.js": "// server entry",
    });

    symlinkSync(join(projectRoot, "real-server.js"), join(projectRoot, "build/server/index.js"));

    const result = verifyBuildOutput(projectRoot, DEFAULT_CONFIG);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("symlink"))).toBe(true);
  });

  it("fails when client directory is a symlink", () => {
    projectRoot = makeTempProject({
      "package.json": JSON.stringify({ name: "test" }),
      "build/server/index.js": "// server entry",
      "real-client/assets/main.js": "// client assets",
    });

    symlinkSync(join(projectRoot, "real-client"), join(projectRoot, "build/client"));

    const result = verifyBuildOutput(projectRoot, DEFAULT_CONFIG);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("symlink"))).toBe(true);
  });

  it("works with custom build directory", () => {
    const customConfig: ResolvedRemixConfig = {
      buildDirectory: "dist",
      serverBuildFile: "server.js",
      serverBuildPath: "dist/server/server.js",
      clientBuildDir: "dist/client",
      appDirectory: "app",
    };

    projectRoot = makeTempProject({
      "package.json": JSON.stringify({ name: "test" }),
      "dist/server/server.js": "// server entry",
      "dist/client/assets/main.js": "// client assets",
    });

    const result = verifyBuildOutput(projectRoot, customConfig);

    expect(result.valid).toBe(true);
    expect(result.serverEntry).toBe(join(projectRoot, "dist/server/server.js"));
    expect(result.clientDir).toBe(join(projectRoot, "dist/client"));
  });

  it("supports legacy serverBuildPath without server subdirectory", () => {
    const legacyConfig: ResolvedRemixConfig = {
      buildDirectory: "build",
      serverBuildFile: "index.js",
      serverBuildPath: "build/index.js",
      clientBuildDir: "public/build",
      appDirectory: "app",
    };

    projectRoot = makeTempProject({
      "package.json": JSON.stringify({ name: "test" }),
      "build/index.js": "// server entry",
      "public/build/main.js": "// client asset",
      "node_modules/.keep": "",
    });

    const result = verifyBuildOutput(projectRoot, legacyConfig);

    expect(result.valid).toBe(true);
    expect(result.serverEntry).toBe(join(projectRoot, "build/index.js"));
    expect(result.clientDir).toBe(join(projectRoot, "public/build"));
  });
});

describe("formatVerificationResult", () => {
  it("formats passed result", () => {
    const result = {
      valid: true,
      errors: [],
      warnings: [],
      serverEntry: "/path/to/build/server/index.js",
      clientDir: "/path/to/build/client",
      hasPackageJson: true,
      hasNodeModules: true,
    };

    const formatted = formatVerificationResult(result);

    expect(formatted).toContain("✅ Build verification passed");
    expect(formatted).toContain("Server: /path/to/build/server/index.js");
    expect(formatted).toContain("Client: /path/to/build/client");
  });

  it("formats failed result with errors", () => {
    const result = {
      valid: false,
      errors: ["Server entry point not found", "Client directory missing"],
      warnings: [],
      hasPackageJson: false,
      hasNodeModules: false,
    };

    const formatted = formatVerificationResult(result);

    expect(formatted).toContain("❌ Build verification failed");
    expect(formatted).toContain("Errors:");
    expect(formatted).toContain("Server entry point not found");
    expect(formatted).toContain("Client directory missing");
  });

  it("includes warnings in output", () => {
    const result = {
      valid: true,
      errors: [],
      warnings: ["node_modules not found"],
      serverEntry: "/path/to/server",
      clientDir: "/path/to/client",
      hasPackageJson: true,
      hasNodeModules: false,
    };

    const formatted = formatVerificationResult(result);

    expect(formatted).toContain("Warnings:");
    expect(formatted).toContain("node_modules not found");
  });
});

describe("buildExists", () => {
  let projectRoot: string;

  afterEach(() => {
    if (projectRoot) {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("returns true when build exists", () => {
    projectRoot = makeTempProject({
      "build/server/index.js": "// server",
      "build/client/main.js": "// client",
    });

    expect(buildExists(projectRoot, DEFAULT_CONFIG)).toBe(true);
  });

  it("returns false when server is missing", () => {
    projectRoot = makeTempProject({
      "build/client/main.js": "// client",
    });

    expect(buildExists(projectRoot, DEFAULT_CONFIG)).toBe(false);
  });

  it("returns false when client is missing", () => {
    projectRoot = makeTempProject({
      "build/server/index.js": "// server",
    });

    expect(buildExists(projectRoot, DEFAULT_CONFIG)).toBe(false);
  });
});
