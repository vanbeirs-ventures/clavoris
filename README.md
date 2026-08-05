# Clavoris website

Static site for Clavoris, currently served as a subfolder of the Van Beirs
Ventures site:

- **Live URL:** https://vanbeirsventures.com/clavoris/
- **Planned:** move under the `clavoris.eu` domain (own pull zone pointing at
  the same storage path, or a dedicated storage zone).

## Deploy pipeline

Source of truth is this repo (`main`). **Never upload straight to Bunny
storage** — the repo would go stale and the next push would silently revert
the site.

`.github/workflows/deploy.yml`: on every push to `main` (unless the commit
message contains `[skip deploy]`) it fetches the storage-zone password via the
Bunny API using org secret `BUNNY_API_KEY`, PUTs every file (excluding
`.git/`, `.github/`, `README.md`) into storage zone `vanbeirsventures`
(id 1692144) **under the `clavoris/` prefix**, then purges pull zone 6222553.

Deploy is upload-only: files deleted in the repo stay behind in Bunny storage
and need manual cleanup.

## Notes

- `robots.txt` and `sitemap.xml` reference `www.clavoris.com` — inert while
  the site lives in a subfolder; update them when the site moves to its own
  domain (`clavoris.eu`).
- The login page is front-end only.
