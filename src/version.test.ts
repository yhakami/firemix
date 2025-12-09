import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it, afterEach } from "vitest";

import {
  getResolvedPackageVersion,
  getResolvedRemixVersion,
  getAdapterVersion,
  isResolvedVersion,
} from "./version.js";

function makeTempProject(packages: Record<string, { version: string }>): string {
  const root = mkdtempSync(join(tmpdir(), "firemix-version-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "test" }), "utf-8");

  const nodeModules = join(root, "node_modules");
  mkdirSync(nodeModules);

  for (const [name, pkg] of Object.entries(packages)) {
    // Handle scoped packages
    if (name.startsWith("@")) {
      const [scope, pkgName] = name.slice(1).split("/");
      const scopeDir = join(nodeModules, `@${scope}`);
      mkdirSync(scopeDir, { recursive: true });
      const pkgDir = join(scopeDir, pkgName);
      mkdirSync(pkgDir);
      writeFileSync(join(pkgDir, "package.json"), JSON.stringify(pkg), "utf-8");
    } else {
      const pkgDir = join(nodeModules, name);
      mkdirSync(pkgDir);
      writeFileSync(join(pkgDir, "package.json"), JSON.stringify(pkg), "utf-8");
    }
  }

  return root;
}

describe("getResolvedPackageVersion", () => {
  let projectRoot: string;

  afterEach(() => {
    if (projectRoot) {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("returns version from node_modules package.json", () => {
    projectRoot = makeTempProject({
      lodash: { version: "4.17.21" },
    });

    const version = getResolvedPackageVersion(projectRoot, "lodash");

    expect(version).toBe("4.17.21");
  });

  it("returns version from scoped packages", () => {
    projectRoot = makeTempProject({
      "@remix-run/node": { version: "2.8.1" },
    });

    const version = getResolvedPackageVersion(projectRoot, "@remix-run/node");

    expect(version).toBe("2.8.1");
  });

  it("returns undefined for non-existent packages", () => {
    projectRoot = makeTempProject({});

    const version = getResolvedPackageVersion(projectRoot, "non-existent");

    expect(version).toBeUndefined();
  });

  it("returns undefined for path traversal attempts", () => {
    projectRoot = makeTempProject({});

    const version = getResolvedPackageVersion(projectRoot, "../../../etc/passwd");

    expect(version).toBeUndefined();
  });

  it("returns undefined for backslash paths", () => {
    projectRoot = makeTempProject({});

    const version = getResolvedPackageVersion(projectRoot, "foo\\bar");

    expect(version).toBeUndefined();
  });

  it("handles symlinked packages gracefully", () => {
    projectRoot = makeTempProject({});

    const nodeModules = join(projectRoot, "node_modules");
    const targetDir = mkdtempSync(join(tmpdir(), "firemix-symlink-"));
    writeFileSync(join(targetDir, "package.json"), JSON.stringify({ version: "1.0.0" }), "utf-8");
    symlinkSync(join(targetDir, "package.json"), join(nodeModules, "symlinked-pkg"));

    const version = getResolvedPackageVersion(projectRoot, "symlinked-pkg");

    // Should return undefined due to symlink detection
    expect(version).toBeUndefined();

    rmSync(targetDir, { recursive: true, force: true });
  });
});

describe("getResolvedRemixVersion", () => {
  let projectRoot: string;

  afterEach(() => {
    if (projectRoot) {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("returns version from @remix-run/node", () => {
    projectRoot = makeTempProject({
      "@remix-run/node": { version: "2.8.1" },
    });

    const version = getResolvedRemixVersion(projectRoot);

    expect(version).toBe("2.8.1");
  });

  it("falls back to @remix-run/react if node is not present", () => {
    projectRoot = makeTempProject({
      "@remix-run/react": { version: "2.8.0" },
    });

    const version = getResolvedRemixVersion(projectRoot);

    expect(version).toBe("2.8.0");
  });

  it("prefers @remix-run/node over @remix-run/react", () => {
    projectRoot = makeTempProject({
      "@remix-run/node": { version: "2.8.1" },
      "@remix-run/react": { version: "2.8.0" },
    });

    const version = getResolvedRemixVersion(projectRoot);

    expect(version).toBe("2.8.1");
  });

  it("returns undefined when no Remix packages are installed", () => {
    projectRoot = makeTempProject({
      lodash: { version: "4.17.21" },
    });

    const version = getResolvedRemixVersion(projectRoot);

    expect(version).toBeUndefined();
  });
});

describe("getAdapterVersion", () => {
  let adapterRoot: string;

  afterEach(() => {
    if (adapterRoot) {
      rmSync(adapterRoot, { recursive: true, force: true });
    }
  });

  it("returns version from package.json", () => {
    adapterRoot = mkdtempSync(join(tmpdir(), "firemix-adapter-"));
    writeFileSync(join(adapterRoot, "package.json"), JSON.stringify({ version: "1.2.3" }), "utf-8");

    const version = getAdapterVersion(adapterRoot);

    expect(version).toBe("1.2.3");
  });

  it("returns 0.0.0 when package.json is missing", () => {
    adapterRoot = mkdtempSync(join(tmpdir(), "firemix-adapter-"));

    const version = getAdapterVersion(adapterRoot);

    expect(version).toBe("0.0.0");
  });
});

describe("isResolvedVersion", () => {
  it("accepts valid semver versions", () => {
    expect(isResolvedVersion("2.8.1")).toBe(true);
    expect(isResolvedVersion("0.0.0")).toBe(true);
    expect(isResolvedVersion("10.20.30")).toBe(true);
  });

  it("accepts versions with prerelease tags", () => {
    expect(isResolvedVersion("2.8.1-beta.1")).toBe(true);
    expect(isResolvedVersion("2.8.1-rc.0")).toBe(true);
    expect(isResolvedVersion("2.8.1-alpha")).toBe(true);
  });

  it("rejects semver ranges", () => {
    expect(isResolvedVersion("^2.8.1")).toBe(false);
    expect(isResolvedVersion("~2.8.1")).toBe(false);
    expect(isResolvedVersion(">=2.8.1")).toBe(false);
    expect(isResolvedVersion("2.x")).toBe(false);
    expect(isResolvedVersion("*")).toBe(false);
  });
});
