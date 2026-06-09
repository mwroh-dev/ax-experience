// cs-ops-core/src/lib/data-dir.ts
//
// Single source of truth for on-disk data paths.
//
// Why this exists: DB paths used to default to `process.cwd()`, so the *same*
// logical DB resolved to different physical files depending on which directory
// a process (api / slack QA script / pipeline run / test) was launched from
// ("path drift"). This anchors every default to the repo root regardless of
// cwd, so all entry points open the same files.
//
// Override order per DB is still: explicit arg > env var > this default.

import fs from 'fs';
import path from 'path';

// Walk up from this module's location until a repo-root marker is found.
// `.git` is present in dev; in a built `dist/` tree the compiled file still
// lives under the repo, so walking up reaches the same root.
function find_repo_root(start: string): string {
  let dir = start;
  // Stop at filesystem root to avoid an infinite loop on an unexpected layout.
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    dir = path.dirname(dir);
  }
  // Fallback: two levels up from src/lib keeps behaviour sane if `.git` is absent
  // (e.g. a tarball deploy). Better than silently falling back to cwd.
  return path.resolve(__dirname, '../../..');
}

const REPO_ROOT = find_repo_root(__dirname);
const DATA_DIR = path.join(REPO_ROOT, '.data');

export function repo_root(): string {
  return REPO_ROOT;
}

// Resolve a data file to <repo-root>/.data/<filename>, creating .data if needed.
export function resolve_data_path(filename: string): string {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  return path.join(DATA_DIR, filename);
}
