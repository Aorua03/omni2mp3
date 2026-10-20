# Security and Privacy

## Data handling

The application is a static browser client. Audio data is read from the local file picker and processed in browser memory. When a PostHog project token and host are configured for the build, the client sends allowlisted anonymous usage events. It does not send audio, filenames, track metadata, file paths, or raw errors. The analytics provider receives the client connection IP at the network layer; configure the PostHog project to disable IP data capture if GeoIP enrichment is not needed. Without the build settings, analytics events are disabled. There is no audio upload API.

Some upstream metadata handlers may request album artwork or public metadata endpoints. Those requests do not contain the encrypted audio payload.

## Reporting

When publishing a fork, replace this section with the maintainer's private security contact. Do not include source music files in public bug reports; use a minimal synthetic fixture when possible.

## Dependency scope

The project inherits a Vue 2 / webpack 4 toolchain from upstream. Most audit findings are in build-time dependencies and are not shipped as a server process. Maintainers should still review `npm audit --omit=dev` before each release and avoid running the development server on an untrusted network.

The 2026-08-03 release baseline uses npm overrides for compatible security patches. `npm audit --omit=dev` reports 0 critical, 3 high, 9 moderate, and 4 low findings. The three high findings are the linked `music-metadata`, `music-metadata-browser`, and `file-type` chain; resolving them requires a tested migration to a new `music-metadata` major version.
