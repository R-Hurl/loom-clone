# Skill: Lint and format changed TypeScript files

## When to use
Use after editing TypeScript files in `loom-clone-frontend`.

## Steps
1. `cd loom-clone-frontend`
2. `yarn quality:changed:ts`
3. If issues are reported, apply fixes and re-run until clean.
4. Summarize changed files.

## Notes
- Uses project Prettier + ESLint config.
- Ignores generated folders: `node_modules`, `.angular`, `dist`, `coverage`.