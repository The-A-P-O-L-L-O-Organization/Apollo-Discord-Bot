# scripts/

## Responsibility
Provides utility scripts for maintaining project metadata, specifically generating cryptographic hashes of source files for integrity verification.

## Design
- Functional programming style with recursive directory traversal
- Uses Node.js built-in modules (crypto, fs, path) for platform-independent file operations
- Implements a depth-first walk algorithm to collect file paths
- Produces a deterministic SHA-256 hash for each file relative to project root

## Flow
1. Script entry point defines constants for plugin root and output path
2. `walk` function recursively reads directories via `readdirSync`
3. For each file, computes relative path and reads contents with `readFileSync`
4. Hashes file content using `createHash('sha256')` and updates manifest map
5. After traversal, writes manifest JSON to `plugin-manifest.json` with `writeFileSync`
6. Logs completion status to console

## Integration
- Dependencies: node:crypto, node:fs, node:path
- Consumed by: build/deployment pipelines requiring plugin-manifest.json
- Output: plugin-manifest.json mapping relative file paths to SHA-256 hashes
- Invoked via: node scripts/generate-manifest.mjs