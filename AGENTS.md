# F1 Simulator Agent Notes

Read `CLAUDE_HANDOFF.md` and `CLAUDE.md` before changing simulation behavior.

## Completion Gate

Do not finish a completed coding batch with only a local Vite server. Run:

```bash
npm run publish
```

That command runs lint, tests, a production build, and the desktop playtest;
publishes the generated PWA to `https://anemia111.github.io/`; waits for GitHub
Pages to expose the new release; and updates the desktop `F1 Race Simulator`
shortcut with the deployed revision. A task is not complete if this command
fails. Use `-SkipPlaytest` only while diagnosing the publish pipeline, never as
the normal handoff path.

Keep the source repository commit and push separate and intentional. The
publish command must never auto-commit source files or include unrelated work.
