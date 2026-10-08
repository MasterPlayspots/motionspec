# Finding MotionSpec: search surfaces and a repeatable check

MotionSpec is a web-motion compiler and static motion-accessibility audit, available
as an npm package and MCP server. Its scope includes reduced-motion handling and
pause-path checks related to WCAG 2.2.2 and 2.3.3. It is not a complete WCAG audit
or a certification of a finished website. Start with the [README](../README.md)
for installation and the [agent guide](../AGENTS.md) for capability boundaries.

This document explains where MotionSpec can be discovered and how to measure
changes without assuming that different search products share an index or ranking
algorithm. Clear metadata helps people assess relevance; it does not guarantee
placement, recommendations, installations, or inclusion in an agent's default tools.

## Keep the discovery surfaces separate

| Surface | Relevant material | What a check can establish |
| --- | --- | --- |
| Official open-source MCP Registry | [`server.json`](../server.json): stable server name, title, description, package and remote configuration | The published entry and version exist. The API's documented `search` parameter matches substrings of **server names**. |
| GitHub MCP Registry interface | Its displayed entry and links | What this particular interface currently returns. Do not transfer the open-source API's search semantics or infer GitHub's ranking algorithm. |
| GitHub repository search | Repository name, About description, topics; README when requested with `in:readme` | Whether an exact query returns this repository on the inspected pages. Repository topics are maintainer-controlled metadata, distinct from any MCP Registry categories. |
| npm search | Published package description, keywords and package page | Whether the published package is returned. Editing `package.json` on a branch does not update the published npm page. |
| Web search | Public repository, docs, installation guides and other crawlable pages | Which URLs appear in a particular engine's sampled results. Results may be stale, personalized or location-dependent. |
| AI coding assistants | Tool descriptions, setup instructions, README, `AGENTS.md` and optional `llms.txt` | Whether a configured client can discover and use the tools. These files do not automatically install MotionSpec or guarantee an assistant recommendation. |

The [official Registry API specification](https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/api/openapi.yaml)
documents name-substring search. A description containing `accessibility` therefore
does **not** make that API return MotionSpec for `search=accessibility`. Retain the
stable identity `io.github.MasterPlayspots/motionspec`; do not create duplicate
listings or rename the server just to insert keywords.

The [schema used by this repository](https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json)
limits both `description` and optional `title` to 100 characters. There is no
standard long-description field in this schema; put detailed explanations in the
linked documentation. Downstream registries may consume or present metadata
differently; see the [Registry overview](https://modelcontextprotocol.io/registry/about).

## Write for an actual task

Use a small set of terms where they describe implemented behavior:

| User intent | Natural search terms | Evidence to put beside the claim |
| --- | --- | --- |
| Find the project | `MotionSpec MCP`, `motionspec npm`, `MotionSpec web animation` | Canonical repository, exact package and server names, installation instructions |
| Respect motion preferences | `prefers-reduced-motion`, `reduced motion`, `motion accessibility`, `a11y` | Generated-code example and the limits of static CSS scanning |
| Review persistent animation | `WCAG 2.2.2`, `pause stop hide`, `animation pause button` | Pause-control example, configuration warnings, manual runtime review |
| Review interaction motion | `WCAG 2.3.3`, `animation from interactions` | Reduced-motion example; identify this criterion as Level AAA |
| Generate motion from a spec | `GSAP`, `CSS animation`, `deterministic motion compiler`, `MCP server` | Spec-to-code example, catalog reference and validation response |
| Check agent-written UI code | `AI-generated UI motion`, `motion validation MCP` | Reproducible input/output and an explicit distinction between spec validation and website auditing |

Avoid claims such as “automatically verifies WCAG compliance,” “audits all GSAP
runtime animation,” or “guarantees accessible websites.” `motion_validate` checks
a MotionSpec object; `motion_audit` scans fetched HTML and stylesheets. An audit
with no findings does not establish that all rendered motion is accessible.
The W3C explains the scope and exceptions of
[Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)
and [Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html).

Keep the README opening, repository About description, npm metadata and Registry
description consistent. Use relevant repository topics such as `mcp-server`,
`accessibility`, `wcag`, `prefers-reduced-motion`, `gsap` and `web-animation`.
Do not fill descriptions with repeated keywords. GitHub documents
[repository search fields](https://docs.github.com/en/search-github/searching-on-github/searching-for-repositories);
npm documents how [description and keywords](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/)
help package discovery.

## Fixed search matrix

Run the same queries at baseline, 14 days and 28 days. Keep separate rows for each
surface and query; never turn a merged search response into query-specific ranks.

| ID | Surface | Exact query or request | Record |
| --- | --- | --- | --- |
| R1 | Official MCP Registry API | `GET https://registry.modelcontextprotocol.io/v0.1/servers?search=motionspec&version=latest` | Exact matching identity, returned version, status, pagination and metadata |
| R2 | Official MCP Registry API | `GET https://registry.modelcontextprotocol.io/v0.1/servers/io.github.MasterPlayspots%2Fmotionspec/versions/latest` | Canonical entry and published description; retrieval errors separately |
| G1 | GitHub MCP Registry UI | `motionspec` | Displayed entry, text, destination and interface URL |
| G2 | GitHub MCP Registry UI | `accessibility`; `reduced motion`; `WCAG` | One observation per query; no assumed matching fields |
| H1 | GitHub repository search | `motionspec in:name` | Repository present in inspected results |
| H2 | GitHub repository search | `accessibility mcp in:name,description,topics` | Repository present; query, sort and page limit |
| H3 | GitHub repository search | `"prefers-reduced-motion" in:readme` | README discoverability, separate from default repository search |
| N1 | npm search | `motionspec`; `motion accessibility`; `prefers-reduced-motion` | One observation per query; exact package and displayed description |
| W1 | Web search | `"MotionSpec" "MCP" accessibility` | Result URLs and snippets |
| W2 | Web search | `"prefers-reduced-motion" "MCP server"` | Result URLs and snippets |
| W3 | Web search | `"WCAG 2.2.2" "MCP"` | Result URLs and snippets |

For UI and web searches, inspect a fixed window, for example the first 20 results.
Report `not_seen_in_first_20` rather than “not indexed.” Record an ordinal position
only when that interface exposes an ordered list for that specific query. An API
list order is not an SEO rank. If an API returns a cursor, record the page scope or
follow it before making a completeness claim. A blocked request is `blocked`, not
a zero-result search.

## Initial observation: 2026-10-08

A limited web-search probe submitted W1, W2 and W3 together through a search tool
(`system2_search_query`). The combined returned result set contained:

- [MotionSpec documentation](https://motionspec.dev/docs)
- [The MotionSpec repository](https://github.com/MasterPlayspots/motionspec)
- [The German website](https://motionspec.dev/de)
- [The Claude installation guide](https://motionspec.dev/blog/install-motionspec-mcp-claude)

This establishes discovery in that combined sample only. The tool response did
not support a query-by-query ranking attribution. Some indexed snippets were
approximately two months old, including an earlier repository About description;
they are not evidence of the current live text or of an improvement from this
change. No traffic, installation or conversion result was inferred.

| Measurement | Baseline status |
| --- | --- |
| Web queries W1–W3 | `observed_combined_sample`; query-level positions `not_measured` |
| Official Registry API R1 | `observed`: exact identity `io.github.MasterPlayspots/motionspec`, version `1.2.7` at `2026-10-08T21:32:16Z`; this is a returned-list observation, not a UI ranking |
| Official Registry API R2 | `not_measured` |
| GitHub MCP Registry UI G1–G2 | `not_measured` |
| GitHub repository search H1–H3 | `not_measured` |
| npm search N1 | `not_measured`; separate npm `GET /motionspec/latest` check returned `1.2.7` at `2026-10-08T21:32:16Z` |
| Search Console, GitHub traffic and hosted tool-use trends | `not_measured` |

The R1 payload still carried the pre-change description beginning “Deterministic motion compiler”.
This confirms publication is still pending for the new metadata. Source requests: the R1 URL
above and `https://registry.npmjs.org/motionspec/latest`.

## Record publication, then compare equal windows

Use the actual publication date for each surface as its own day zero. A README
merge, npm release, Registry publication and website deployment can happen on
different dates. Follow the existing release process, retain version consistency,
and verify the published payload before marking a change live. A branch update
does not publish npm or Registry metadata. The
[Registry aggregation guide](https://modelcontextprotocol.io/registry/registry-aggregators)
also describes downstream synchronization and mostly immutable version metadata.

| Checkpoint | Work | Interpretation |
| --- | --- | --- |
| Baseline / day zero | Save the exact queries, available observations, published metadata, commit and versions. Record unavailable metrics explicitly. | Establishes what is known before publication; no invented starting values. |
| Day 14 | Repeat the matrix with the same engine/interface, region, language, sign-in state, sort and result limit. Compare the first complete 14-day period with the previous complete period where available. | Directional observation; label crawl lag and releases/outreach that may explain differences. |
| Day 28 | Repeat again and compare the second 14-day period with the first. | Decide which documentation needs clearer task examples; do not claim causality from rank or traffic movement alone. |

Suggested record fields: `observed_at_utc`, `surface`, `query_id`, `exact_query`,
`interface_or_api_url`, `language`, `region`, `signed_in`, `sort`, `result_limit`,
`pages_checked`, `result_status`, `matched_url_or_server_name`, `observed_position`
(nullable), `published_version`, `source_commit`, `evidence_reference`, `notes`.
Keep raw private analytics exports and personal correspondence out of this public
repository; publish only intentionally reviewed summaries.

Where authorized access exists, supplement search observations with Search Console
query/page impressions and clicks, GitHub repository traffic, npm downloads and
aggregate hosted tool counts. These are different units; do not add them together
or label them unique users. GitHub's
[traffic view](https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/viewing-traffic-to-a-repository)
has a rolling 14-day visitor/clone window, so retain snapshots before data ages out.
The [analytics plan](analytics-plan.md) explains the limits of existing telemetry.

## Useful documentation and community follow-through

Publish a reproducible example for each supported task: a persistent animation
with a visible pause control, a reduced-motion fallback, and a static audit report
whose exclusions are visible. Link each example back to one canonical installation
guide and the relevant catalog primitive.

When sharing a study or benchmark, link the public methodology, dataset and
limitations, and distinguish observed findings from general claims about
AI-generated interfaces. Share these technical examples in relevant accessibility
and developer communities under their contribution rules. Measure resulting
referrals separately from search visibility; a post is not evidence of Registry
promotion or an official product integration.
