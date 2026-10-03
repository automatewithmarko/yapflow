# YapFlow security model

YapFlow is open source while the official distribution pipeline remains under
maintainer control.

## What is public

- all application and website source code;
- the updater endpoint;
- the public updater verification key; and
- signed update metadata and downloadable release artifacts.

The public key verifies a signature. It cannot generate one.

## What is never committed

- the updater private signing key;
- Apple Developer ID certificates and notarization credentials;
- Windows code-signing credentials;
- GitHub, Railway, DNS, or domain credentials; and
- local environment files and user data.

These are excluded from source control and supplied only to the trusted release
environment.

## Update trust boundary

An official YapFlow installation accepts an update only when its artifact
matches a signature made by the private updater key corresponding to the
embedded public key. Publishing different metadata or hosting a modified file
is insufficient.

The Railway service provides static files and update metadata using only
`GET` and `HEAD`. It contains no public mutation or deployment API.
Possession of the source code does not confer GitHub, Railway, Apple, DNS, or
release access.

Forks should replace both the update endpoint and updater public key. Fork
authors are responsible for their own signing identity and release security.

## Local data

Transcription models execute locally. Speech history, vocabulary, and meeting
recordings are stored locally. YapFlow does not need an account or a hosted
transcription API. Network access is limited to explicit model downloads,
update checks, update downloads, and normal website use.
