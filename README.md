# 🔥 Firemix

Firebase App Hosting adapter for Remix.

Deploy your Remix app to [Firebase App Hosting](https://firebase.google.com/docs/app-hosting) with zero configuration.

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

  // Remix build directory (default: "build")
  buildDir: "build",

  // Cloud Run configuration
  runConfig: {
    minInstances: 0,    // Scale to zero (default: 0)
    maxInstances: 10,   // Max instances (default: 10)
    concurrency: 80,    // Requests per instance (default: 80)
    cpu: 1,             // CPU allocation (default: 1)
    memoryMiB: 512,     // Memory in MiB (default: 512)
  },
});
```

### CLI Options

```bash
firemix --help

Options:
  --output, -o    Output directory (default: .apphosting)
  --build, -b     Remix build directory (default: build)
  --allow-dev-deps  Allow bundling when devDependencies are installed (default: false)
  --help, -h      Show help message
```

## Firebase Setup

1. Initialize Firebase App Hosting in your project:

```bash
firebase init apphosting
```

2. Add Firemix to your build:

```ts
// vite.config.ts
import { firemix } from "firemix/vite";

export default defineConfig({
  plugins: [remix(), firemix()],
});
```

3. Deploy:

```bash
npm run build
firebase deploy --only apphosting
```

## Generated Bundle

Firemix generates a `.apphosting/bundle.yaml` file:

```yaml
version: v1

runConfig:
  runCommand: node build/server/index.js
  concurrency: 80
  cpu: 1
  memoryMiB: 512
  minInstances: 0
  maxInstances: 10

outputFiles:
  serverApp:
    include:
      - build
      - node_modules
      - package.json
  staticAssets:
    include:
      - build/client

metadata:
  adapterPackageName: firemix
  adapterVersion: 0.1.0
  framework: remix
```

## How It Works

Firebase App Hosting uses the [output bundle specification](https://firebase.google.com/docs/app-hosting/frameworks-tooling) to understand how to build and deploy your app. Firemix:

1. Detects your Remix configuration
2. Generates the `bundle.yaml` with correct paths
3. Configures Cloud Run settings for optimal Remix performance

## Requirements

- Remix 2.0+
- Vite 5.0+
- Node.js 18+

## License

MIT © [Yazeed M.A. Hakami](https://github.com/yhakami)

---

Built with ❤️ for the Remix and Firebase communities.
