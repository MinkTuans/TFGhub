# TFGhub Project Knowledge Base

This directory is the authoritative documentation hub for developers and AI agents. Current code, contracts, migrations, and tests remain the ultimate source of truth; update these documents whenever behavior or architecture changes.

## Required reading order

1. [Project overview](01-project/overview.md) and [repository map](01-project/repository-map.md)
2. [System architecture](02-architecture/system-architecture.md) and the relevant architecture document
3. The relevant [feature](03-features/current-capabilities.md) and [workflow](04-workflows/authoring-publishing-and-assets.md)
4. [API](05-api/README.md) and [database](06-database/schema-and-migrations.md) boundaries
5. [Agent](08-rules/agent-rules.md), [coding, and security](08-rules/coding-and-security-rules.md) rules
6. Relevant source code, migrations, and tests before making a change

## Current documentation

| Area | Document |
| --- | --- |
| Context | [Overview](01-project/overview.md), [repository map](01-project/repository-map.md), [glossary](12-reference/glossary.md) |
| Architecture | [System](02-architecture/system-architecture.md), [Engine and Studio](02-architecture/engine-and-studio.md), [decisions](02-architecture/architectural-decisions.md) |
| Product | [Current capabilities](03-features/current-capabilities.md), [workflows](04-workflows/authoring-publishing-and-assets.md) |
| Interfaces | [API](05-api/README.md), [database](06-database/schema-and-migrations.md), [configuration](12-reference/configuration.md) |
| AI and rules | [Agent context](07-ai/agent-context.md), [skills and prompts](07-ai/skills-and-prompts.md), [agent rules](08-rules/agent-rules.md) |
| Delivery | [Development/testing](09-development/setup-and-testing.md), [troubleshooting](09-development/troubleshooting.md), [deployment](10-deployment/runbook.md) |
| History | [History index](11-history/README.md), [changelog](11-history/changelog.md), [important commits](11-history/important-commits.md) |

## Documentation lifecycle

- **Current** documents describe the checked-in implementation.
- **Planned** behavior must be labeled explicitly and must not be described as delivered.
- Files under `11-history/designs`, `11-history/plans`, and `11-history/reports` are historical evidence. Unchecked boxes and old commands are not current implementation status or permission to modify a deployment.

The repository has no implemented generative-AI integration. Agent documentation describes how coding agents work safely on this repository, not an application AI subsystem.
