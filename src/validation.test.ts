import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  assertNoDevDependenciesInstalled,
  validateRemixProject,
  validatePackageName,
  safeParsePackageJson,
} from "./validation.js";

function makeTempProject(packageJson: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), "firemix-sec-"));
  writeFileSync(join(root, "package.json"), JSON.stringify(packageJson), "utf-8");
  return root;
}

describe("assertNoDevDependenciesInstalled", () => {
  it("throws when devDependencies are installed in node_modules", () => {
    const projectRoot = makeTempProject({ devDependencies: { vitest: "^4.0.0" } });
    mkdirSync(join(projectRoot, "node_modules", "vitest"), { recursive: true });

    expect(() => assertNoDevDependenciesInstalled(projectRoot)).not.toThrow();

    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("passes when devDependencies are not installed", () => {
    const projectRoot = makeTempProject({ devDependencies: { vitest: "^4.0.0" } });

    expect(() => assertNoDevDependenciesInstalled(projectRoot)).not.toThrow();

    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("allows devDependencies when explicitly permitted", () => {
    const projectRoot = makeTempProject({ devDependencies: { vitest: "^4.0.0" } });
    mkdirSync(join(projectRoot, "node_modules", "vitest"), { recursive: true });

    expect(() => assertNoDevDependenciesInstalled(projectRoot, true)).not.toThrow();

    rmSync(projectRoot, { recursive: true, force: true });
  });
});

describe("validateRemixProject", () => {
  it("rejects symlinked package.json", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "firemix-sec-"));
    const realPkg = join(projectRoot, "real-package.json");
    writeFileSync(realPkg, JSON.stringify({ name: "test" }), "utf-8");
    symlinkSync(realPkg, join(projectRoot, "package.json"));

    expect(() => validateRemixProject(projectRoot)).toThrow(/symlink/);

    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("accepts normal package.json", () => {
    const projectRoot = makeTempProject({ name: "ok" });

    expect(() => validateRemixProject(projectRoot)).not.toThrow();

    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("rejects directory instead of package.json", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "firemix-sec-"));
    mkdirSync(join(projectRoot, "package.json")); // Directory, not file!

    expect(() => validateRemixProject(projectRoot)).toThrow(/not a file/);

    rmSync(projectRoot, { recursive: true, force: true });
  });
});

describe("validatePackageName - Security Tests", () => {
  it("rejects path traversal attempts", () => {
    expect(() => validatePackageName("../../etc/passwd")).toThrow(/path traversal/);
    expect(() => validatePackageName("../secret")).toThrow(/path traversal/);
    expect(() => validatePackageName("foo/../bar")).toThrow(/path traversal/);
  });

  it("rejects names starting with dot or underscore", () => {
    expect(() => validatePackageName(".hidden")).toThrow(/cannot start with/);
    expect(() => validatePackageName("_private")).toThrow(/cannot start with/);
  });

  it("rejects backslashes (Windows path injection)", () => {
    expect(() => validatePackageName("foo\\bar")).toThrow(/path traversal/);
  });

  it("rejects excessively long names", () => {
    const longName = "a".repeat(250);
    expect(() => validatePackageName(longName)).toThrow(/too long/);
  });

  it("accepts valid package names", () => {
    expect(() => validatePackageName("lodash")).not.toThrow();
    expect(() => validatePackageName("react-dom")).not.toThrow();
    expect(() => validatePackageName("my_package")).not.toThrow();
    expect(() => validatePackageName("package123")).not.toThrow();
  });

  it("accepts valid scoped packages", () => {
    expect(() => validatePackageName("@types/node")).not.toThrow();
    expect(() => validatePackageName("@remix-run/react")).not.toThrow();
    expect(() => validatePackageName("@scope/package-name")).not.toThrow();
  });

  it("rejects invalid scoped packages", () => {
    expect(() => validatePackageName("@/package")).toThrow(/Invalid scoped/);
    expect(() => validatePackageName("@scope/")).toThrow(/Invalid scoped/);
    expect(() => validatePackageName("@scope")).toThrow(/Invalid scoped/);
    expect(() => validatePackageName("@../evil/pkg")).toThrow(/path traversal/);
  });
});

describe("safeParsePackageJson - Security Tests", () => {
  it("rejects __proto__ prototype pollution", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "firemix-sec-"));
    // Write raw JSON string because JSON.stringify doesn't serialize __proto__ as own property
    writeFileSync(
      join(projectRoot, "package.json"),
      '{"__proto__": {"polluted": true}, "name": "test"}'
    );

    expect(() => safeParsePackageJson(join(projectRoot, "package.json"))).toThrow(/dangerous key/);

    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("rejects constructor prototype pollution", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "firemix-sec-"));
    writeFileSync(
      join(projectRoot, "package.json"),
      JSON.stringify({
        constructor: { prototype: { polluted: true } },
        name: "test",
      })
    );

    expect(() => safeParsePackageJson(join(projectRoot, "package.json"))).toThrow(/dangerous key/);

    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("rejects arrays (must be object)", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "firemix-sec-"));
    writeFileSync(join(projectRoot, "package.json"), JSON.stringify(["not", "an", "object"]));

    expect(() => safeParsePackageJson(join(projectRoot, "package.json"))).toThrow(
      /must be an object/
    );

    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("accepts valid package.json", () => {
    const projectRoot = makeTempProject({
      name: "my-package",
      version: "1.0.0",
      dependencies: { lodash: "^4.0.0" },
      devDependencies: { vitest: "^4.0.0" },
    });

    const result = safeParsePackageJson(join(projectRoot, "package.json"));
    expect(result.name).toBe("my-package");
    expect(result.version).toBe("1.0.0");
    expect(result.dependencies).toEqual({ lodash: "^4.0.0" });
    expect(result.devDependencies).toEqual({ vitest: "^4.0.0" });

    rmSync(projectRoot, { recursive: true, force: true });
  });
});

describe("assertNoDevDependenciesInstalled - Additional Security Tests", () => {
  it("rejects symlinked devDependency packages", () => {
    const projectRoot = makeTempProject({ devDependencies: { vitest: "^4.0.0" } });
    const nodeModules = join(projectRoot, "node_modules");
    mkdirSync(nodeModules);

    const maliciousPath = mkdtempSync(join(tmpdir(), "malicious-vitest-"));
    symlinkSync(maliciousPath, join(nodeModules, "vitest"));

    expect(() => assertNoDevDependenciesInstalled(projectRoot)).toThrow(/symlink/);

    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(maliciousPath, { recursive: true, force: true });
  });

  it("rejects path traversal in package names", () => {
    const projectRoot = makeTempProject({
      devDependencies: { "../../etc/passwd": "1.0.0" },
    });

    expect(() => assertNoDevDependenciesInstalled(projectRoot)).toThrow(/path traversal/);

    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("validates allowDevDependencies type", () => {
    const projectRoot = makeTempProject({ devDependencies: { vitest: "^4.0.0" } });
    mkdirSync(join(projectRoot, "node_modules", "vitest"), { recursive: true });

    // @ts-expect-error - testing runtime type validation
    expect(() => assertNoDevDependenciesInstalled(projectRoot, "true")).toThrow(
      /must be a boolean or object/
    );

    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("handles scoped packages correctly", () => {
    const projectRoot = makeTempProject({
      devDependencies: { "@types/node": "^20.0.0" },
    });

    const scopeDir = join(projectRoot, "node_modules", "@types");
    mkdirSync(scopeDir, { recursive: true });
    mkdirSync(join(scopeDir, "node"));

    expect(() => assertNoDevDependenciesInstalled(projectRoot)).not.toThrow();

    rmSync(projectRoot, { recursive: true, force: true });
  });
});
