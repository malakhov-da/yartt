# Publishing and releases

How the code gets to GitHub, how every change is checked there, and how a
release becomes an image on Docker Hub that a company runs
([admin/install.md](../admin/install.md)).

## What is already in the repository

| File | What it does |
|---|---|
| `.github/workflows/ci.yml` | every push to `master` and every pull request: `npm run typecheck`, `npm test`, `npm run e2e` against PostgreSQL 17 in a service container; the end-to-end report is attached when it fails |
| `.github/workflows/release.yml` | a tag `v1.2.3`: the same checks, then the image for `linux/amd64` and `linux/arm64` pushed to Docker Hub as `1.2.3`, `1.2`, `1` and `latest`, and a GitHub release with notes generated from the commits |
| `.github/dependabot.yml` | weekly minor and patch updates of npm packages, actions and the base image; major versions are not proposed (they are pinned on purpose) |

## Once: the repository on GitHub

1. Create the repository on GitHub (empty, without a README or a
   license — they are here already).
2. Push the history and the tags:

   ```sh
   git remote add origin git@github.com:<owner>/yartt.git
   git push -u origin master --tags
   ```

3. **Settings → Branches → Add rule** for `master`: require a pull
   request and the `CI / check` status to pass before merging. From then
   on nothing reaches `master` unchecked.
4. **Settings → Code security**: turn on Dependabot alerts and secret
   scanning (free for public repositories).
5. Before accepting the first outside pull request, install CLA Assistant
   with the agreements in `legal/` — the roadmap item "Contributions with
   a signed assignment" describes it.

## Once: Docker Hub

1. On [hub.docker.com](https://hub.docker.com) create the repository the
   image goes to, e.g. `yartt/yartt` (an organization keeps it apart from
   a personal account), public.
2. **Account settings → Personal access tokens → Generate**, access
   "Read & Write", named "GitHub Actions yartt".
3. In GitHub, **Settings → Secrets and variables → Actions**:
   - secrets `DOCKERHUB_USERNAME` (the Docker Hub account) and
     `DOCKERHUB_TOKEN` (the token from step 2);
   - variable `DOCKERHUB_REPOSITORY` = `yartt/yartt`.

## Every release

1. On `master`, with CI green, decide the version: patch — fixes only,
   never the schema; minor — features; major — only from the last minor
   (AGENTS.md, Database).
2. If the schema changed since the last release, there is a migration
   `server/migrations/<from>-<to>.sql` and the new version in `db.sql`.
   **For 1.0 itself:** copy `db.sql` to `server/migrations/1.0.sql` — the
   snapshot every later migration is checked against.
3. Set `"version"` in `package.json` (the footer shows it; the release
   workflow refuses a tag that does not match), commit it, then tag and
   push:

   ```sh
   git tag v1.0.0
   git push origin master v1.0.0
   ```

4. Watch **Actions → Release**. When it is green the image is on Docker
   Hub and the release with its notes is on GitHub; the notes are the
   commit messages, which is why they are written as a changelog.
5. Check the image as a company would: `docker pull yartt/yartt:1.0.0`
   and start it against an empty PostgreSQL by
   [admin/install.md](../admin/install.md).

A broken release is not re-tagged: fix forward with the next patch
version, so nobody runs two different images under one number.

## Worth adding when the project grows

- **`SECURITY.md`** — how to report a vulnerability privately (GitHub's
  private vulnerability reporting can be turned on in the security
  settings).
- **The Docker Hub description** from the README, kept in step by an
  extra step in the release workflow (`peter-evans/dockerhub-description`).
- **GitHub Container Registry** as a second registry: the same
  `docker/login-action` with `ghcr.io` and the workflow's `GITHUB_TOKEN`.
- **Signed images** (cosign, keyless through GitHub's OIDC) and an SBOM —
  `docker/build-push-action` can attach the SBOM and provenance.
- **Issue and pull request templates** in `.github/`, so reports come
  with the version and the steps.
