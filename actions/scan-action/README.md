# MotionSpec accessibility scan — GitHub Action

Scans one public page with the MotionSpec scanner — axe-core against WCAG 2.2 A/AA in a real
browser, plus a motion module (WCAG 2.2.2) — and fails the job when violations at or above a
severity threshold are found. Optional: a short result as a pull request comment.

> Automated testing detects only part of the possible barriers under WCAG 2.2 A/AA. Many
> criteria can only be judged by a person. The result does not confirm accessibility and is
> not legal advice.

No dependencies, no build step: `index.mjs` + `lib.mjs` run on the `node24` Actions runtime.

## Usage

```yaml
name: Accessibility scan
on:
  pull_request:

permissions:
  contents: read
  pull-requests: write   # only for comment: true

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: MasterPlayspots/motionspec/actions/scan-action@<commit-sha>
        with:
          url: https://preview.example.com/
          api-key: ${{ secrets.MOTIONSPEC_API_KEY }}
          api-url: ${{ vars.MOTIONSPEC_API_URL }}
          fail-on: serious
          max-violations: 0
          comment: true
```

Pin the action to a full commit SHA. You need a MotionSpec API key (stored as a secret) and
the base URL of the MotionSpec scan API (without `/v1`; a trailing `/v1` is removed).

**Pull requests from forks** get no repository secrets, so `api-key` would be empty and the
step would fail. Skip the scan for them:

```yaml
      - uses: MasterPlayspots/motionspec/actions/scan-action@<commit-sha>
        if: github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository
```

The action masks the API key in the log right away (also when it comes from `vars`), keeps
texts from the API on one line so they cannot start workflow commands, and neutralises
`@mentions` and `#references` from the API in the pull request comment.

## Inputs

| Input | Default | Meaning |
|---|---|---|
| `url` | — (required) | Public http(s) URL of the page to scan. |
| `api-key` | — (required) | MotionSpec API key, sent as `Authorization: Bearer`. Never printed. |
| `api-url` | — (required) | Base URL of the scan API, without `/v1` (a trailing `/v1` is removed). https only (http only for localhost). |
| `language` | `en` | Language of rule titles and the coverage notice: `en` or `de`. |
| `fail-on` | `serious` | Lowest severity that counts: `critical`, `serious`, `moderate`, `minor`, or `none` (never fail on violations). |
| `max-violations` | `0` | Violations at or above `fail-on` that are still accepted. |
| `fail-on-not-measurable` | `true` | Fail when the page could not be measured (bot protection, login, timeout). A page that was not measured is never a clean result. |
| `timeout-seconds` | `300` | How long to wait for the result. |
| `comment` | `false` | Post or update one comment on the pull request (needs `pull-requests: write`). |
| `github-token` | `${{ github.token }}` | Token for the comment. |

## Outputs

`result` (`passed`, `failed`, `not-measurable`, `error`), `scan-id`, `status`, `critical`,
`serious`, `moderate`, `minor`, `review` (findings to check by hand, never counted as
violations), `violations` (count at or above `fail-on`), `report-url` (link to the full
report for a human to open, when offered).

## Exit code

`0` when the violations at or above `fail-on` do not exceed `max-violations`; `1` when they
do, when the page was not measurable (unless `fail-on-not-measurable: false`), or when the
scan could not run (invalid input, API error, timeout). A failed comment is only a warning.

## What it sends

`POST {api-url}/v1/scans` with `{url, art: "gratis", sprache, quelle: "action"}` and your API
key, then `GET {api-url}/v1/scans/{id}` until the scan is done. The short result contains
counts per severity, the top 3 rules and the coverage notice — not the full report.
