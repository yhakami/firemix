# Firemix

Firebase App Hosting adapter for Remix.

Deploy your Remix app to [Firebase App Hosting](https://firebase.google.com/docs/app-hosting) with zero configuration.

## Features

- **Zero-config** - Automatically detects Remix configuration from `vite.config.ts`
- **Build verification** - Validates build output before generating bundle
- **Security hardened** - Path sanitization, symlink detection, prototype pollution protection
- **Resolved versions** - Reports actual installed Remix version, not semver ranges
- **Ready-to-serve bundle** - Server and client assets packaged together so `remix-serve` can serve static files
- **Flexible CLI** - Full control via command-line flags
- **Vite plugin** - Automatic bundle generation on build

## Installation

```bash
npm install firemix --save-dev
```

## Quick Start

### Option 1: Vite Plugin (Recommended)

Add the Firemix plugin to your `vite.config.ts`:

```ts
import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig } from "vite";
import { firemix } from "firemix/vite";

export default defineConfig({
  plugins: [remix(), firemix()],
});
```

Now when you run `npm run build`, Firemix automatically generates the `.apphosting/bundle.yaml` file.

### Option 2: CLI

Run after your Remix build:

```bash
npm run build
npx firemix
```

## Configuration

### Vite Plugin Options

```ts
firemix({
  // Output directory for bundle.yaml (default: ".apphosting")
  outputDir: ".apphosting",

  // Remix build directory - auto-detected from vite.config.ts (default: "build")
  buildDirectory: "build",

  // Server entry file name (default: "index.js")
  serverBuildFile: "index.js",

  // Override the run command for Cloud Run
  runCommand: "node_modules/.bin/remix-serve build/server/index.js",

  // Skip build verification (default: true)
  verify: true,

  // Cloud Run configuration
  runConfig: {
    minInstances: 0,    // Scale to zero (default: 0)
    maxInstances: 10,   // Max instances (default: 10)
    concurrency: 80,    // Requests per instance (default: 80)
    cpu: 1,             // CPU allocation (default: 1)
    memoryMiB: 512,     // Memory in MiB (default: 512)
  },

  // Development options
  allowDevDependencies: false,  // Allow dev deps in bundle (default: false)
  allowSymlinks: false,         // Allow symlinked packages (default: false)
  verbose: false,               // Show detailed output (default: false)
});
```

### CLI Options

```bash
firemix --help

Usage:
  firemix [options]

Options:
  --output, -o <dir>        Output directory (default: .apphosting)
  --build, -b <dir>         Remix build directory (default: build)
  --server-file <name>      Server entry file name (default: index.js)
  --run-command <cmd>       Override the run command for Cloud Run
  --allow-dev-deps          Allow bundling when devDependencies are installed
  --allow-symlinks          Allow symlinked packages in node_modules
  --no-verify               Skip build output verification
  --dry-run                 Preview bundle.yaml without writing
  --verify-only             Only verify build output, don't generate bundle
  --version, -v             Show version number
  --help, -h                Show this help message

Cloud Run options:
  --min-instances <n>       Minimum instances (default: 0)
  --max-instances <n>       Maximum instances (default: 10)
  --concurrency <n>         Concurrent requests per instance (default: 80)
  --cpu <n>                 CPU allocation (default: 1)
  --memory <n>              Memory in MiB (default: 512)

Examples:
  firemix                        # Generate with defaults
  firemix -o .apphosting         # Specify output directory
  firemix -b dist                # Specify build directory
  firemix --dry-run              # Preview without writing
  firemix --verify-only          # Just verify build output
```

## Firebase Setup

1. Initialize Firebase App Hosting in your project:

```bash
firebase init apphosting
```

2. Add Firemix to your build:

```ts
// vite.config.ts
import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig } from "vite";
import { firemix } from "firemix/vite";

export default defineConfig({
  plugins: [remix(), firemix()],
});
```

3. Build and deploy:

```bash
npm run build
git add . && git commit -m "Add Firebase App Hosting support"
git push  # Triggers automatic deployment
```

## Generated Bundle

Firemix generates a `.apphosting/bundle.yaml` file:

```yaml
version: v1

runConfig:
  runCommand: node_modules/.bin/remix-serve build/server/index.js
  concurrency: 80
  cpu: 1
  memoryMiB: 512
  minInstances: 0
  maxInstances: 10

outputFiles:
  serverApp:
    include:
      - build/server
      - build/client
      - package.json
      - node_modules

metadata:
  adapterPackageName: firemix
  adapterVersion: 0.1.2
  framework: remix
  frameworkVersion: 2.8.1
```

## How It Works

Firebase App Hosting uses the [output bundle specification](https://firebase.google.com/docs/app-hosting/frameworks-tooling) to understand how to build and deploy your app. Firemix:

1. **Detects configuration** - Reads `vite.config.ts` or `remix.config.js` to find build settings
2. **Verifies build output** - Checks that server and client builds exist
3. **Resolves versions** - Gets actual installed Remix version from `node_modules`
4. **Generates bundle** - Creates `bundle.yaml` with correct paths and Cloud Run settings
5. **Validates security** - Blocks path traversal, symlinks, and dev dependencies

## Programmatic API

```ts
import {
  generateBundle,
  generateBundleWithMetadata,
  serializeBundle,
  resolveRemixConfig,
  verifyBuildOutput,
  getResolvedRemixVersion,
} from "firemix";

// Generate bundle programmatically
const bundle = generateBundle("/path/to/project", {
  buildDirectory: "build",
  runConfig: { minInstances: 1 },
});

// Get bundle with metadata and warnings
const { bundle, remixConfig, warnings } = generateBundleWithMetadata(
  "/path/to/project"
);

// Serialize to YAML
const yaml = serializeBundle(bundle);

// Resolve Remix configuration
const config = resolveRemixConfig("/path/to/project");
console.log(config.serverBuildPath); // "build/server/index.js"

// Verify build output
const result = verifyBuildOutput("/path/to/project", config);
if (!result.valid) {
  console.error(result.errors);
}

// Get resolved Remix version
const version = getResolvedRemixVersion("/path/to/project");
console.log(version); // "2.8.1" (not "^2.8.0")
```

## Custom Build Directory

If you use a custom build directory in your Remix config:

```ts
// vite.config.ts
export default defineConfig({
  plugins: [
    remix({ buildDirectory: "dist" }),
    firemix({ buildDirectory: "dist" }),
  ],
});
```

Firemix will automatically detect the build directory from `vite.config.ts`, but you can also specify it explicitly.

## Security

Firemix includes several security measures:

- **Path sanitization** - Prevents path traversal attacks (`../`)
- **Symlink detection** - Blocks symlinked packages by default
- **Dev dependency check** - Prevents bundling development tooling
- **File size limits** - Prevents DoS via large files
- **Prototype pollution protection** - Safe JSON parsing

To allow symlinks or dev dependencies during development:

```bash
firemix --allow-symlinks --allow-dev-deps
```

## Troubleshooting

### "Build verification failed"

Run `firemix --verify-only` to see detailed build verification output:

```bash
npx firemix --verify-only
```

This shows which files are missing and where they're expected.

### "devDependencies present in node_modules"

Before deploying, install only production dependencies:

```bash
npm ci --omit=dev
npx firemix
```

Or for testing, allow dev dependencies:

```bash
npx firemix --allow-dev-deps
```

### Custom server entry point

If your server uses a different entry file:

```bash
npx firemix --server-file server.js
```

Or in vite.config.ts:

```ts
firemix({ serverBuildFile: "server.js" });
```

## Requirements

- Remix 2.0+
- Vite 5.0+
- Node.js 18+

## Comparison with Other Adapters

| Feature | Firemix | SvelteKit Adapter |
|---------|---------|-------------------|
| Target | App Hosting | Hosting + Functions |
| Config | Auto-detect | Manual firebase.json |
| Build verification | Yes | No |
| Version resolution | Resolved | Semver range |
| CLI | Full-featured | Minimal |
| Emulator support | Via App Hosting | Full |

## License

MIT

---

Built with care for the Remix and Firebase communities.
