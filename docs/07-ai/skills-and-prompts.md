# Skills and prompts

## Repository-owned state

The application contains no LLM prompt pipeline and no tracked project-owned AI skill package. Coding environments may provide external workflows such as Superpowers, but those are operator tooling rather than TFGhub runtime code.

Active local instruction entry points are `AGENTS.md` at the repository root and the generated `apps/web/AGENTS.md`. Authoritative project rules remain in [agent rules](../08-rules/agent-rules.md).

## Safe agent workflow

1. Read the docs hub and relevant context/architecture.
2. Locate the feature workflow, API, database, and rules involved.
3. Inspect current source, dependencies, migrations, and tests.
4. State assumptions and define observable success criteria.
5. Make the smallest compatible change, preferably test-first for behavior.
6. Run focused and boundary-appropriate verification.
7. Update current documentation when behavior or architecture changes.

Prompts or task notes are not specifications unless they are reconciled with current source and explicitly accepted requirements. Do not store credentials, personal tokens, or production dumps in prompts or reports.
