# MotionSpec usage measurement: current behavior and proposed additions

**Status: design only.** This document adds no collector, tracking request,
dependency, scheduled job or telemetry switch. It describes the inspected package
code and a possible future hosted measurement design. The hosted HTTP Worker,
deployment bindings and production datasets are not present in this repository;
their deployed behavior was not verified here.

The goal is to understand aggregate tool demand and reliability without collecting
the content that users ask MotionSpec to process. These counts are operational
signals, not installation counts, individual users, or evidence of WCAG compliance.

## What this repository actually measures

The inspected source is the package code at
`78576d0d1f5569bd042c718a08a9db396c155b94`.

| Component | Observed behavior | Measurement limit |
| --- | --- | --- |
| [`telemetry.js`](../src/router/telemetry.js) | Uses a configurable sink; adds a timestamp and caps strings/arrays. `summary()` groups stored records by outcome. | Clamping is not a field allowlist or anonymization. Nested objects are not recursively scrubbed. |
| [`FileSink`](../src/router/telemetry-sink.js) | Default sink appends JSONL under `telemetry/events.jsonl` relative to the package. The directory is gitignored. | Local records are not a global dataset. This sink does not upload them; it also does not implement rotation or retention deletion. |
| [`MemorySink`](../src/router/telemetry-sink.js) | Stores records in process memory. | Volatile, process-local records; no durable or cross-instance totals. |
| `motion_validate` | Records `mcp-validate-ok` or `mcp-validate-fail` after ordinary validation, with failure error strings. | Oversize input returns before this logging call. `ok` means spec validity, not absence of accessibility warnings. |
| `motion_compile` | Records `mcp-compile-ok` or `mcp-compile-fail` after compilation, with failure error strings. | Oversize input returns before this logging call. A successful compile is not a completed user deployment. |
| `motion_audit` | Records `mcp-audit-ok` or `mcp-audit-fail`, without the audited URL in this logging call. | “OK” is an executed audit, not an accessible-page verdict. Findings can still exist. |
| `motion_catalog` | Returns the catalog without calling `telemetry.log`. | Catalog demand cannot be recovered from these records. |
| `motion_stats` | Reads the active sink's summary without adding an event itself. | Reports the sink's scope and lifetime, not all MotionSpec use. |
| [`route.js`](../src/router/route.js) | Logs route outcomes, attempts, durations and cache keys; some failure/escalation paths include request text, reasons or error strings. | Do not forward this event stream to a hosted collector unchanged. |

MCP behavior above comes from
[`register-tools.js`](../src/mcp/register-tools.js). Errors rejected by the MCP
framework before a handler, or at a hosted authentication/rate-limit boundary,
are outside those handler counters. Comments referring to an `AnalyticsEngineSink`
do not establish that an implementation or deployed binding is available here.

`summary().total` counts stored events, not necessarily requests: cache invalidation
can be followed by another routing event for the same request. Local summaries do
not calculate latency percentiles or average latency from ordinary `ms` records;
`avgMs` accepts `avg_ms` supplied by an aggregating sink. Do not present this as a
complete request funnel or a hosted latency dashboard.

## Existing data needs careful handling

Existing local records can contain user text and interpolated validation errors.
Length caps do not remove sensitive content. Do not upload local JSONL files,
historical error strings, cache keys or raw exports to establish a growth baseline.
Any future local-data migration needs an explicit, reviewed field mapping; it
must not silently add network reporting to the local CLI or stdio server.

The proposed hosted pipeline must build a new bounded metrics object, not spread
an existing event with `{ ...event }` and attempt to remove a few known fields.
Discard unrecognized keys and map unrecognized enum values to `other` or
`unknown` before anything reaches storage.

## Proposed hosted aggregate schema

This is a proposal for the repository that actually owns the hosted Worker.
Keep production and staging datasets separate. Store daily aggregate counts and
fixed latency buckets instead of per-request payloads or exact timestamps.

| Field | Allowed values or shape | Purpose |
| --- | --- | --- |
| `schema_version` | Fixed metrics schema version | Distinguish measurement changes |
| `day_utc` | UTC calendar day | Compare complete, equal windows |
| `environment` | `production`, `staging` | Separate experiments from production |
| `metric` | `http_requests`, `tool_calls`, `validation_warnings`, `collector_drops` | Keep transport and tool units separate |
| `tool` | The five registered tool names, `unknown`, `not_applicable` | Bounded tool-demand breakdown |
| `outcome` | Reviewed fixed enum, e.g. `ok`, `validation_failed`, `oversize`, `auth_required`, `rate_limited`, `internal_error`, `other` | Reliability and boundary failures |
| `traffic_class` | `synthetic`, `known_crawler`, `unknown` | Separate operator checks and identified crawlers from unclassified calls |
| `access_class` | `keyless`, `keyed`, `unknown`, `not_applicable` | Evaluate access paths without retaining keys or account identity |
| `warning_code` | Explicit allowlist of public `MS-*` codes, `other`, `not_applicable` | Understand advisory warnings without storing messages |
| `duration_bucket_ms` | Fixed histogram buckets defined in the implementation, or `not_applicable` | Aggregate latency distribution |
| `count` | Non-negative integer aggregate | Volume, with documented sampling rules |

Do not retain raw specs, prompts, target URLs, domains, selectors, generated code,
free-text errors, headers, referrers, IP addresses, user agents, cookies, session
IDs, request IDs, account IDs, keys, key hashes, cache keys or fingerprints in
this usage dataset. Hashing an identifier does not make it necessary for aggregate
counts. Apply the same constraints to logs, traces and failed-write diagnostics.

Classify owned health checks through a trusted server-side execution path or
authenticated internal metadata that is discarded before storage. Do not trust an
arbitrary public header to exclude traffic from reports. Keep crawler classification
coarse, document how it is obtained, and retain `unknown` when no reliable signal
exists. Normal MCP users are often AI agents: automation alone must not classify
their tool calls as unwanted bots. `unknown` must not be renamed “human users.”

## Count useful units without inventing a user funnel

| Metric | Definition | What it cannot establish |
| --- | --- | --- |
| Catalog demand | Terminal `motion_catalog` invocations by day and traffic class | Unique developers or new installs |
| Validation success | `motion_validate` calls returning `ok:true` / all completed validation calls; failures and oversize outcomes shown separately | Whether the same caller later compiled or deployed |
| Validation warnings | Calls with at least one warning, plus per-code counts; deduplicate the same code within one call | That a warning was fixed or that a page violates a criterion at runtime |
| Compile and audit reliability | Completed tool calls by terminal outcome; latency histograms | Accessibility conformance or successful customer adoption |
| HTTP availability | Requests by bounded outcome, separately from tool calls | Tool invocations when a request contains no invocation or is rejected early |
| Aggregate demand balance | Catalog, validate, compile and audit counts displayed side by side | A catalog-to-validate conversion rate; callers cannot be joined in this design |

Add catalog coverage at the shared tool boundary only after designing how local
and hosted sinks will behave. Count each tool invocation at one terminal boundary,
including early exits; do not add a wrapper counter on top of existing handler
counters and then sum both. An HTTP request and a tool invocation are separate
units. Transport retries can produce another invocation; label the data as calls,
not deduplicated tasks.

Synthetic probes should have their own series and be excluded from primary demand
comparisons. Keep staging, collector failures and any sampling factor visible.
Use weighted counts if the storage provider samples; do not treat sampled rows as
raw requests. Cloudflare documents this behavior for
[Workers Analytics Engine sampling](https://developers.cloudflare.com/analytics/analytics-engine/sampling/).

## Delivery plan for the hosted repository

1. Locate the actual Worker source, current release and sink binding. Inspect the
   active schema, metrics scope, operational logs and retention before proposing a
   migration. Existing README claims are not a substitute for this check.
2. Agree on the fixed enums, bucket boundaries, time window and intended report.
   Keep raw events out of the design. Define bounded buffers, aggregation flushes
   and a dropped-metrics counter. A metrics failure must not block a tool result.
3. Implement one central allowlist mapper and terminal-count boundary. Cover
   catalog, validation, compilation, audit, authentication and size/rate rejection
   paths without changing public tool responses or compiler output. Treat stats
   reads separately so monitoring does not inflate product demand.
4. Verify in staging with fixed fixtures: no submitted secrets or URLs in stored
   rows or logs; unknown fields dropped; invalid enums normalized; each path
   counted once; synthetic traffic separate; sink outage leaves tool behavior
   intact; aggregation totals and weighted queries agree.
5. Review access and retention. A proposed starting policy is aggregate daily data
   for 90 days, with an explicit deletion mechanism and verification; choose and
   document a supported implementation before describing that policy as active.
   Access to administrative reports remains restricted to the relevant operator.
6. Release through the hosted project's normal review/deployment process. Record
   the actual deployment version and metrics start time. Keep a rollback switch
   that stops new metric writes without affecting MCP tools. Do not backfill
   missing catalog history or label pre-instrumentation gaps as zero use.

No step above is implemented or enabled by this documentation change.

## Combine independent signals, keeping their labels

The [discovery check](discovery.md) supplies repeatable search observations.
Additional sources can show different parts of adoption:

- **npm downloads:** package delivery volume, including possible repeat, CI and
  automated downloads. These are not unique installations, active users or
  attributed Registry referrals.
- **GitHub traffic:** repository visitors, views and full clones under GitHub's
  definitions. Preserve complete snapshots within the
  [rolling 14-day window](https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/viewing-traffic-to-a-repository).
  Do not infer clone source or MCP use from them.
- **Search Console:** the authorized property's aggregate query/page impressions
  and clicks. Compare complete windows and keep query/page definitions consistent;
  see [the performance report](https://support.google.com/webmasters/answer/7576553).
- **Hosted tool calls:** the approved collector's covered endpoint, versions,
  environments and time range only. They exclude unreported local stdio use.

Anonymous aggregate series cannot establish a per-person journey from search to
installation to validation to payment. Show them together as separate indicators,
record releases and outreach alongside the dates, and describe changes as
observations rather than causal conversion claims.
