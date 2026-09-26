# WebP-Canonical Uploads

Every raster original (JPEG, PNG, BMP, TIFF) is stored as WebP exactly once, at upload: the browser pre-encodes before spending a request and the Asset Registry re-encodes after receiving one — so no `jpg`, `jpeg`, `png`, `bmp` or `tiff` bytes ever land under `public/uploads/`.

## Status
Accepted

## Context
Uploads kept whatever encoding the editor's camera or screenshot tool produced, so the same image cost kilobytes as a PNG that it would as a WebP, and the 2 MB guardrail judged files nobody would ever serve. `sharp` was already a build dependency for Astro image optimization but cannot run on Cloudflare Workers, so a server-only conversion would work in dev and refuse in production.

## Decision
1. `packages/blocks` owns the canonicalization rule (`isConvertibleRaster`, `webpFilenameFor`, quality 82): JPEG, PNG, BMP and TIFF convert; AVIF and WebP pass through (AVIF is typically smaller than WebP); GIF passes through (conversion would collapse animation to one frame); SVG passes through (a vector, not a raster).
2. The browser pre-encodes before the queue's size verdict, so the verdict judges the bytes the server will store; any pre-encode failure keeps the original and the server is the retry.
3. The server re-encodes via a lazily-loaded `sharp` on Node and refuses convertibles with a send-WebP message where `sharp` cannot run (Workers), mapping a converter outage to a 400 rather than a crash.
4. Size verdicts, filenames, MIME types and byte counts throughout the registry describe the canonical bytes; `originalName` keeps the provenance of what the editor picked.

## Considered Options
- Server-only conversion: rejected, Workers cannot run `sharp` and dev/prod would disagree about what an upload becomes.
- Browser-only conversion: rejected, a client that skips the encoder (curl, an old browser) would store the original bytes with no second chance.
- Banning AVIF too: rejected, it is the smaller encoding; the rule canonicalizes to the smallest practical bytes, not to one format for its own sake.

## Consequences
- Bytes already in the repo are untouched; only new uploads canonicalize, so history stays stable.
- A converted WebP that still exceeds 2 MB is refused as a WebP: the guardrail judges stored bytes, never originals.
