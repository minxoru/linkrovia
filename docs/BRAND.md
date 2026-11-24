# Linkrovia brand guide

This guide describes the identity used by the Linkrovia open-source project. A self-hosted installation can set its own display name, mark, favicon, and primary colors in source.

## Identity

Use the name `Linkrovia` with that capitalization. The recommended product line is **Every link. The right destination.** The short description is **Open-source smart link management on your Cloudflare account.** Avoid claims that imply Cloudflare sponsorship, guaranteed cost, or perfectly accurate analytics.

The route monogram represents a primary path with a mint branch to another destination. Do not add arrows, text, cloud imagery, chain imagery, or extra gradients to the mark.

## Repository assets

The brand files are bundled in [`static/brand/`](../static/brand/).

| Asset                                         | Use                                  |
| --------------------------------------------- | ------------------------------------ |
| `logo-light.svg`                              | Horizontal logo on light backgrounds |
| `logo-dark.svg`                               | Horizontal logo on dark backgrounds  |
| `mark.svg`                                    | Navy tile mark                       |
| `mark-transparent-light.svg`                  | Dark mark for light backgrounds      |
| `mark-transparent-dark.svg`                   | White mark for dark backgrounds      |
| `favicon.svg`                                 | SVG favicon                          |
| `icon-32.png`, `icon-192.png`, `icon-512.png` | Browser and installable-app icons    |
| `og.png`                                      | 1200 x 630 social preview            |

SVGs contain only local paths and shapes; they do not load fonts, scripts, images, or other network resources. The horizontal source logos use an Inter-compatible system font fallback. For environments that need deterministic lettering, convert the wordmark to outlines with a properly licensed local Inter font before publishing a derivative.

## Palette

| Token   | Value     | Guidance                                           |
| ------- | --------- | -------------------------------------------------- |
| Ink     | `#0D1729` | Headers, text, and mark tile                       |
| Route   | `#0F766E` | Light-theme primary action and links               |
| Signal  | `#2DD4BF` | Mark branch, dark-theme primary action, highlights |
| Insight | `#6D5EF8` | Supporting data visualization color                |
| Canvas  | `#F5F8FA` | Light application background                       |

Dark application surfaces use `#0B1220` and `#122036`; dark primary text is `#EAF4F5`. Do not use Signal as small text on white (`#2DD4BF` does not provide sufficient contrast there). Preserve visible focus states and distinguish status with text or icons as well as color.

## Logo usage

Prefer the horizontal logo at 28 px or taller. Use the mark alone at 20 px or taller; inspect 16 px use separately. Keep at least 8 px of clear space around the mark and at least one quarter of the logo height around the horizontal logo. Never stretch, skew, recolor, reduce opacity, or place the light wordmark on a light background.

Choose the logo variant to match the surface it appears on. Serve the favicon and manifest icons from the installation's origin.

## Social preview

`og.png` is a local render at 1200 × 630. It pairs the route mark with the product name and tagline inside an 80 px safe zone. Run `npm run brand:render` after installing the development Chromium browser to regenerate it with the bundled Inter font and current brand tokens.

## Self-hosted personalization

To personalize a fork for your deployment, edit the brand files and rebuild.

- Set the display name, mark and social image paths, and repository link in [`src/lib/brand.ts`](../src/lib/brand.ts). Mark and social image paths are relative to `static/`.
- Replace the favicon and icon files in [`static/brand/`](../static/brand/) or update their references in [`src/app.html`](../src/app.html) and the [manifest handler](../src/routes/manifest.webmanifest/+server.ts).
- Set the light and dark primary, text, hover, and focus colors in [`src/lib/styles/tokens.css`](../src/lib/styles/tokens.css). Check both themes for contrast and visible focus.
- Keep supplied SVGs free of external resources, active markup, and scripts. Linkrovia renders the mark as an image.

Use your configured domain for short links. Serve the identity visually with locally bundled assets. Linkrovia is an independent open-source project.

## Provenance and review

The repository includes the initial brand assets. Formal trademark clearance remains a release task. The bundled [Inter font notice](../static/licenses/inter.txt) and [Lucide icon notices](../static/licenses/lucide.txt) cover the typography and interface icons.
