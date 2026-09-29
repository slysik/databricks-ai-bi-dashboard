# Pulse application version policy

## Active version

`app-pwb8_2026_09_29-16_44` is **Version 2** and is the only application that may receive feature, data-contract, or deployment changes.

- Runtime/UI: AppKit, React, TypeScript, and the Version 2 API adapter
- Databricks app resource: `app-pwb8`
- Deployment configuration: `databricks.yml` in this directory
- Production URL: `https://app-pwb8-7474656067656578.aws.databricksapps.com`

## Frozen version

Version 1 is frozen. Do not edit, deploy, copy changes into, or point automation at its source directory. It may be used only for historical comparison or rollback after an explicit decision.

## Guardrails

1. Run all app commands from this directory.
2. Deploy only the `app-pwb8` resource declared in this directory's `databricks.yml`.
3. Do not use an older app source path as a deployment source.
4. Review `git diff` before deployment and confirm every changed app file belongs to Version 2.
