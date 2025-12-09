# Firemix Architecture Design

## Overview

Firemix is a Firebase App Hosting adapter for Remix. This document outlines the architecture for a production-ready, battle-hardened implementation.

## Research Summary

### Firebase App Hosting Bundle Specification

The bundle.yaml follows this schema:

```typescript
interface OutputBundle {
  version: "v1"
  runConfig: {
    runCommand: string           // e.g., "node_modules/.bin/remix-serve build/server/index.js"
    environmentVariables?: EnvVarConfig[]
    concurrency?: number         // Max concurrent requests per instance
    cpu?: number                 // CPU count per instance
    memoryMiB?: number           // Memory allocation per instance
    minInstances?: number        // Minimum running instances
    maxInstances?: number        // Maximum running instances
  }
  metadata: {
    adapterPackageName: string   // "firemix"
    adapterVersion: string       // Resolved from firemix package.json
    framework: string            // "remix"
    frameworkVersion?: string    // Resolved from node_modules
  }
  outputFiles?: {
    serverApp: {
      include: string[]          // Server files to deploy
    }
    staticAssets?: {
      include: string[]          // Static assets (CDN-served)
    }
  }
}
```

### Remix Vite Configuration

Modern Remix uses Vite with these key options:
- `buildDirectory`: Output path (default: "build")
- `serverBuildFile`: Server file name (default: "index.js")
- `appDirectory`: Source directory (default: "app")

Output structure:
```
build/
├── server/
│   └── index.js      # Server entry point
└── client/
    └── assets/       # Static assets (CSS, JS, images)
```

### Patterns from Other Adapters

**SvelteKit Firebase Adapter:**
- Reads firebase.json to determine output directories
- Supports multi-site configurations
- Prints Cloud Function code rather than auto-writing
- Uses esbuild for bundling

**Nitro Firebase App Hosting:**
- Zero-configuration support
- Preset identifier `firebase_app_hosting`
- Auto-generates bundle.yaml at build time

## Current Issues

1. **Hardcoded paths**: Ignores Remix config overrides (serverBuildPath, buildDirectory)
2. **Bundle overlap**: Includes build twice (serverApp contains build, staticAssets contains build/client)
3. **Unfiltered node_modules**: Ships all node_modules including dev tooling
4. **Missing CLI flags**: No --allow-symlinks flag despite API support
5. **No existence checks**: Doesn't verify build outputs exist
6. **Incorrect version**: Reports semver range, not resolved version

## Proposed Architecture

### Module Structure

```
src/
├── index.ts           # Public API exports
├── types.ts           # Type definitions
├── config.ts          # NEW: Remix config resolution
├── version.ts         # NEW: Version resolution utilities
├── verify.ts          # NEW: Build output verification
├── bundle.ts          # Bundle generation (improved)
├── validation.ts      # Input validation & security
├── cli.ts             # CLI interface (improved)
└── vite.ts            # Vite plugin (improved)
```

### New Modules

#### 1. `config.ts` - Remix Config Resolution

```typescript
interface ResolvedRemixConfig {
  buildDirectory: string      // "build"
  serverBuildFile: string     // "index.js"
  serverBuildPath: string     // "build/server/index.js" (computed)
  clientBuildDir: string      // "build/client" (computed)
  appDirectory: string        // "app"
}

function resolveRemixConfig(projectRoot: string): ResolvedRemixConfig
```

Resolution strategy:
1. Try to read vite.config.ts and extract remix plugin options
2. Fall back to remix.config.js/mjs/ts for legacy projects
3. Apply defaults for missing values

#### 2. `version.ts` - Version Resolution

```typescript
function getResolvedRemixVersion(projectRoot: string): string | undefined
function getResolvedPackageVersion(projectRoot: string, packageName: string): string | undefined
```

Resolution strategy:
1. Read `node_modules/@remix-run/node/package.json` version field
2. Fall back to `node_modules/@remix-run/react/package.json`
3. Return undefined if package not found (don't use semver range)

#### 3. `verify.ts` - Build Verification

```typescript
interface BuildVerificationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  serverEntry: string
  clientDir: string
}

function verifyBuildOutput(projectRoot: string, config: ResolvedRemixConfig): BuildVerificationResult
```

Checks:
- Server entry point exists (`build/server/index.js`)
- Client assets directory exists (`build/client`)
- package.json exists
- node_modules exists (optional warning if missing)

### Improved Bundle Generation

**Before (problematic):**
```yaml
outputFiles:
  serverApp:
    include:
      - build             # Contains both server AND client
      - node_modules
      - package.json
  staticAssets:
    include:
      - build/client      # Already included in serverApp via build/
```

**After (clean separation):**
```yaml
outputFiles:
  serverApp:
    include:
      - build/server      # Server only
      - package.json
      - node_modules      # Filtered to production deps
  staticAssets:
    include:
      - build/client      # Client only (no overlap)
```

### CLI Improvements

New flags:
- `--allow-symlinks`: Allow symlinked packages in node_modules
- `--run-command`: Override the run command
- `--dry-run`: Preview bundle.yaml without writing
- `--verify`: Verify build output before generating

### Security Hardening

1. **Path validation**: All user paths sanitized and bounded
2. **Symlink detection**: Detect and block symlinks by default
3. **File size limits**: Prevent DoS via large files
4. **Prototype pollution protection**: Safe JSON parsing
5. **Build verification**: Fail fast if outputs missing

### Testing Strategy

1. **Unit tests**: Validation, config parsing, version resolution
2. **Integration tests**: End-to-end bundle generation with real Remix builds
3. **Security tests**: Path traversal, symlink attacks, prototype pollution
4. **Snapshot tests**: bundle.yaml output stability

## Implementation Plan

### Phase 1: Foundation
1. Add `config.ts` for Remix config resolution
2. Add `version.ts` for proper version resolution
3. Add `verify.ts` for build verification

### Phase 2: Bundle Improvements
4. Update `bundle.ts` to use resolved config
5. Fix serverApp/staticAssets separation
6. Add run command customization

### Phase 3: CLI & Plugin
7. Add new CLI flags
8. Update Vite plugin to use resolved config
9. Add dry-run and verify modes

### Phase 4: Testing & Docs
10. Add integration tests with fixture projects
11. Update documentation
12. Add migration guide

## References

- [Firebase App Hosting Docs](https://firebase.google.com/docs/app-hosting)
- [Firebase Framework Tools](https://github.com/FirebaseExtended/firebase-framework-tools)
- [Remix Vite Config](https://remix.run/docs/en/main/file-conventions/vite-config)
- [SvelteKit Firebase Adapter](https://github.com/jthegedus/svelte-adapter-firebase)
- [Nitro Firebase Provider](https://nitro.build/deploy/providers/firebase)
