# Jev redesign phase gate

This server-only tool classifies evidence as `complete`, `partial`, `regressed`, `blocked`, or `needs_human_review`. Deterministic tests remain authoritative; Jev is an advisory coverage and ambiguity check.

```bash
node --env-file=/secure/path/.env tools/jev/check-phase.ts /tmp/phase-evidence.json
```

Provide `TYPESAFE_API_KEY` (preferred) or `OPENROUTER_API_KEY` outside the repository. Evidence contains `phase`, `requirements`, `deterministicChecks`, and `changedFiles`. Output contains decision metadata, never credentials or authorization headers.
