# Linkrovia working agreement

## Documentation

- Write the README, contributor guides, and other GitHub documentation in English by default.
- Record decisions that depart from the project specification and track verification results by phase.
- Keep public documentation aligned with the features and deployment paths that have been verified.

## Implementation and verification

- Use the configured instance hostname when generating short URLs. Keep the project website separate from short-link routing.
- Verify current Cloudflare and library behavior against official documentation and installed types.
- Use the package versions and Node.js release pinned in this repository. Run `npm run check`, `npm run lint`, `npm test`, `npm run build`, and the relevant browser tests before reporting a phase result.
- Design the default installation as a guided, on-screen flow. Explain required actions in plain language, link to the relevant provider screen, and show how to recover from failed checks. Keep the standard flow usable without a command line or prior Cloudflare knowledge.
- Put operator settings in the admin UI and persist validated preferences. Reserve environment configuration for bootstrap values, infrastructure bindings, and server-side secrets.
- Keep local development Docker-free and isolated from remote Cloudflare resources by default. Keep credentials and local state out of Git.
