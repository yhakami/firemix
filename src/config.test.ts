import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it, afterEach, vi } from "vitest";

import { resolveRemixConfig, applyConfigOverrides } from "./config.js";

function makeTempProject(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "firemix-config-"));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(root, name), content, "utf-8");
  }
  return root;
}

describe("resolveRemixConfig", () => {
  let projectRoot: string;

  afterEach(() => {
    if (projectRoot) {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("returns defaults when no config files exist", () => {
    projectRoot = makeTempProject({
      "package.json": JSON.stringify({ name: "test" }),
    });

    const config = resolveRemixConfig(projectRoot);

    expect(config.buildDirectory).toBe("build");
    expect(config.serverBuildFile).toBe("index.js");
    expect(config.serverBuildPath).toBe("build/server/index.js");
    expect(config.clientBuildDir).toBe("build/client");
    expect(config.appDirectory).toBe("app");
  });

  it("extracts buildDirectory from vite.config.ts", () => {
    projectRoot = makeTempProject({
      "package.json": JSON.stringify({ name: "test" }),
      "vite.config.ts": `
        import { defineConfig } from "vite";
        import { remix } from "@remix-run/dev";

        export default defineConfig({
          plugins: [remix({ buildDirectory: "dist" })],
        });
      `,
    });

    const config = resolveRemixConfig(projectRoot);

    expect(config.buildDirectory).toBe("dist");
    expect(config.serverBuildPath).toBe("dist/server/index.js");
    expect(config.clientBuildDir).toBe("dist/client");
  });

  it("extracts serverBuildFile from vite.config.ts", () => {
    projectRoot = makeTempProject({
      "package.json": JSON.stringify({ name: "test" }),
      "vite.config.ts": `
        export default {
          plugins: [remix({ serverBuildFile: "server.js" })],
        };
      `,
    });

    const config = resolveRemixConfig(projectRoot);

    expect(config.serverBuildFile).toBe("server.js");
    expect(config.serverBuildPath).toBe("build/server/server.js");
  });

  it("extracts multiple options from vite.config.ts", () => {
    projectRoot = makeTempProject({
      "package.json": JSON.stringify({ name: "test" }),
      "vite.config.ts": `
        export default defineConfig({
          plugins: [
            remix({
              buildDirectory: "output",
              serverBuildFile: "main.js",
              appDirectory: "src",
            }),
          ],
        });
      `,
    });

    const config = resolveRemixConfig(projectRoot);

    expect(config.buildDirectory).toBe("output");
    expect(config.serverBuildFile).toBe("main.js");
    expect(config.serverBuildPath).toBe("output/server/main.js");
    expect(config.clientBuildDir).toBe("output/client");
    expect(config.appDirectory).toBe("src");
  });

  it("reads vite.config.js when vite.config.ts is not present", () => {
    projectRoot = makeTempProject({
      "package.json": JSON.stringify({ name: "test" }),
      "vite.config.js": `
        module.exports = {
          plugins: [remix({ buildDirectory: "dist-js" })],
        };
      `,
    });

    const config = resolveRemixConfig(projectRoot);

    expect(config.buildDirectory).toBe("dist-js");
  });

  it("reads legacy remix.config.js as fallback", () => {
    projectRoot = makeTempProject({
      "package.json": JSON.stringify({ name: "test" }),
      "remix.config.js": `
        module.exports = {
          serverBuildPath: "build/index.js",
          assetsBuildDirectory: "public/build",
          appDirectory: "source",
        };
      `,
    });

    const config = resolveRemixConfig(projectRoot);

    // Legacy config support
    expect(config.appDirectory).toBe("source");
    expect(config.serverBuildPath).toBe("build/index.js");
    expect(config.clientBuildDir).toBe("public/build");
  });

  it("warns when Vite config cannot be statically parsed", () => {
    projectRoot = makeTempProject({
      "package.json": JSON.stringify({ name: "test" }),
      "vite.config.ts": `
        import { defineConfig } from "vite";
        import { remix } from "@remix-run/dev";

        export default defineConfig(({ mode }) => ({
          plugins: [
            remix({
              buildDirectory: mode === "production" ? "dist" : "build-dev",
            }),
          ],
        }));
      `,
    });

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const config = resolveRemixConfig(projectRoot);

    expect(config.buildDirectory).toBe("build");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("could not statically read Remix options")
    );

    warn.mockRestore();
  });
});

describe("applyConfigOverrides", () => {
  it("overrides buildDirectory and recomputes paths", () => {
    const base = {
      buildDirectory: "build",
      serverBuildFile: "index.js",
      serverBuildPath: "build/server/index.js",
      clientBuildDir: "build/client",
      appDirectory: "app",
    };

    const result = applyConfigOverrides(base, { buildDirectory: "dist" });

    expect(result.buildDirectory).toBe("dist");
    expect(result.serverBuildPath).toBe("dist/server/index.js");
    expect(result.clientBuildDir).toBe("dist/client");
  });

  it("overrides serverBuildFile and recomputes serverBuildPath", () => {
    const base = {
      buildDirectory: "build",
      serverBuildFile: "index.js",
      serverBuildPath: "build/server/index.js",
      clientBuildDir: "build/client",
      appDirectory: "app",
    };

    const result = applyConfigOverrides(base, { serverBuildFile: "main.js" });

    // serverBuildFile triggers recomputation of serverBuildPath
    expect(result.serverBuildFile).toBe("main.js");
    expect(result.serverBuildPath).toBe("build/server/main.js");
  });

  it("rejects path traversal in buildDirectory", () => {
    const base = {
      buildDirectory: "build",
      serverBuildFile: "index.js",
      serverBuildPath: "build/server/index.js",
      clientBuildDir: "build/client",
      appDirectory: "app",
    };

    expect(() => applyConfigOverrides(base, { buildDirectory: "../etc" })).toThrow(
      /path traversal/i
    );
  });
});
