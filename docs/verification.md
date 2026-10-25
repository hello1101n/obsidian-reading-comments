# Verification

## Automated checks

`npm test` passes 19 tests, and `npm run build` passes TypeScript checking and bundles the plugin. The plugin-host tests use jsdom, minimal Obsidian API substitutes, and a real temporary filesystem. They exercise selection → composer → saved JSON → Resolve → Reopen → copied prompt, external AI status edits, same-text DOM replacement, and stale refresh rejection.

Independent review identified two refresh defects. Regression tests reproduced both, then passed after the fixes: annotations survive identical-text DOM rebuilds, and stale failed loads cannot overwrite newer state.

## Native Obsidian verification — 2026-10-25

Reading Comments v0.1.0 was verified through the native Obsidian 1.14.5 UI on macOS using a disposable note. Installed plugin files matched the built artifacts.

1. Selected a paragraph, bold text, and a table cell in Reading view. The Add comment button, composer, Cmd+Enter save, highlights, markers, and sidebar cards worked.
2. Confirmed all five initial comment additions left the Markdown byte-for-byte unchanged.
3. Resolved and reopened a comment. JSON status persisted, and Copy review prompt was disabled when no open comments remained.
4. Copied the real review prompt through the UI and pasted it into a disposable note to verify its paths and instructions.
5. Inserted a paragraph above an annotated passage. Highlights stayed attached to the original passages.
6. Acted as the AI consumer of that prompt: applied a rollout date, preserved a formatted phrase as requested, changed a table value, and attempted an impossible request involving a missing file. Saved each status immediately after processing. All four attempted comments became resolved, including the failure; an intentionally unprocessed fifth stayed open. Obsidian refreshed the edits and statuses automatically.
7. Renamed the note inside Obsidian. The sidecar moved, source changed, IDs and statuses survived, and old sidecars were removed.
8. Quit and reopened the regular Obsidian application. The plugin, comments, statuses, and updated Markdown restored correctly.
9. Edited a resolved comment and verified its status stayed resolved, then deleted that disposable comment.
10. Disabled the plugin and verified its sidebar, ribbon action, markers, and highlights disappeared while the note remained readable. Re-enabled it and verified saved markers returned.

The final test state contained three resolved comments and one open comment. Screenshots in this repository use fictional demonstration content.

## Coverage limits

The native checks above verify the core workflow, not every supported input. Theme changes, cross-paragraph selection, embedded notes, very long virtualized notes, multiple windows, and pathological concurrent writes were not exhaustively tested in the native app. DOM and storage tests cover formatted/cross-block selection, exclusion of embedded notes, external conflicts, malformed JSON, and refresh races.

AI processing depends on the agent following the copied prompt. The plugin reads saved statuses; it does not run an AI model or independently judge whether the agent processed a comment.
