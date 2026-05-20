# codex.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan.

---

## 5. Editor Realtime: Undo / Redo / Autosave

**This is the most fragile area in the codebase. Read this section before touching anything below.**

The editor's autosave, undo/redo, STOMP publish/echo, and 2D↔3D sync are **one tightly-coupled state machine**, not four independent features. A two-line change in one place can silently drop edits, double-publish, freeze the save status at `syncing`, or send the local undo cursor out of sync with the server. The system has no central reducer — it's coordinated through ~6 refs and ~4 effects spread across these files:

| File | Role |
|------|------|
| `useEditorPage.ts` | Owns the refs, the publish effect, the snapshot dirty markers. Orchestrator. |
| `useWorkspaceCommandPublisher.ts` | Owns `pendingCommandRef` (single-slot). One command per publish. |
| `useWorkspaceHistorySyncController.ts` | Owns cursor updates and server-error handling. |
| `useBubbleSnapshotRealtime.ts` | Owns STOMP subscriptions, dispatches server echoes. |
| `useWorkspaceRemoteSnapshotHandlers.ts` | Applies remote snapshots to local state. Gates own-edit echoes. |
| `workspaceRealtime.service.ts` | The actual STOMP `publishJson`. |

### 5.1 The state model (memorize this)

Six refs in `useEditorPage.ts` carry the real state. The save-status string in React state is **derived** — never the source of truth.

```
hasUserEditedRef                      bool. True the moment the user does anything.
                                      Resets to false ONLY when a publish completes (synced) or
                                      a remote snapshot replaces local state.

previousSnapshotRef                   serialized JSON of the last snapshot that is "known synced".
                                      Used to dedupe re-publish of identical state.
                                      Setting this prematurely silently drops future identical edits.

workspaceEditTransactionDepthRef      int counter. Incremented on drag-start handlers,
                                      decremented on drag-end. While > 0, the publish effect
                                      DEFERS by setting pendingWorkspaceSnapshotCommitRef = true.

pendingWorkspaceSnapshotCommitRef     bool. "A snapshot commit is owed once the transaction closes."
                                      Cleared either by requestWorkspaceSnapshotCommit() OR by
                                      the server cursor update arriving for the in-flight publish.

pendingServerPublishRef               PendingServerPublishRecord | null. The publish currently
                                      in retry-able flight (for the retry/backoff timer).

awaitingServerSyncRef                 AwaitingServerSyncRecord | null. The publish whose server
                                      cursor update we are still waiting for. Cleared by the
                                      cursor-update handler when serializedSnapshot matches.
```

Plus one ref in `useWorkspaceCommandPublisher.ts`:

```
pendingCommandRef                     WorkspaceCommand | null. Single-slot.
                                      Each entity edit OVERWRITES this slot (last-write-wins
                                      within one publish window). consumePendingCommand() drains
                                      it; that drain is destructive.
```

### 5.2 The publish lifecycle (memorize this)

```
   user edit
   │
   ├─► markLocal{Bubble,FloorPlan}SnapshotChanged()
   │      hasUserEditedRef = true
   │      setSaveStatus('dirty')
   │      schedule setWorkspaceSnapshotCommitVersion(v+1)    ◄── tick the publish effect
   │
   │   (for drags: instead use begin/commitWorkspaceSnapshotTransaction
   │    so depth > 0 during the drag and the publish effect defers)
   │
   ▼
   publish effect runs (useEditorPage.ts ~line 2580+)
   │
   │  serialize snapshot
   │  historyDomain = resolveServerHistoryDomain(publishSnapshot)  ◄── 'bubble' | 'floorPlan'
   │
   │  ── short-circuits in this order ─────────────────────────────
   │  • generated-floorPlan autosave suppressed   → status=synced, return
   │  • suppressNextAutosaveRef (remote applied)  → status=synced, return
   │  • previousSnapshotRef === serializedSnapshot && no pending command  → return
   │  • awaitingServerSyncRef matches serializedSnapshot && no pending    → return
   │  • previousSnapshotRef null && !hasUserEdited                        → seed previousSnapshot, return
   │  • !hasUserEditedRef                                                 → return
   │  • workspaceEditTransactionDepthRef > 0                              → set pendingCommit flag, dirty, return
   │
   │  workspaceCommand = (historyDomain==='floorPlan') ? consumePendingCommand() : null
   │
   │  if historyDomain==='floorPlan' && !workspaceCommand:
   │     // floor-plan edit with nothing for the server to do — treat as synced
   │     previousSnapshot = serialized, hasUserEdited=false, status=synced, return
   │
   ▼  publish via STOMP (workspaceRealtime.service.ts)
   pendingServerPublishRef = record
   awaitingServerSyncRef = { projectId, serializedSnapshot, historyDomain, baseIndex, startedAt }
   status='dirty'→'syncing'
   │
   ▼  server processes
   │
   ├─► topic echo (FLOOR_PLAN_UPDATED / BUBBLE_UPDATED) arrives
   │      useBubbleSnapshotRealtime → applyRemoteFloorPlanSnapshot
   │      Gate: if depth>0 OR pendingCommit && !authoritative event → IGNORE
   │      Else apply remote snapshot to local state, suppressNextAutosaveRef=true
   │
   └─► cursor update arrives
          updateFloorPlanHistoryCursor / updateBubbleHistoryCursor
          if awaitingServerSyncRef matches:
             previousSnapshotRef = our serializedSnapshot
             awaitingServerSyncRef = null
             pendingServerPublishRef = null
             if depth > 0  → status='dirty', return     (still editing)
             if pendingCommit → clear, status='dirty', requestRepublish()
             else status='synced'
```

For undo/redo the user-initiated path is:

```
   user undo/redo
   │
   ▼  publish FLOOR_PLAN_UNDO / FLOOR_PLAN_REDO   (uses floorPlanHistoryCommandInFlightRef as lock)
   │
   ▼  server replays history, broadcasts FLOOR_PLAN_UPDATED with prior snapshot
   │
   ▼  applyRemoteFloorPlanSnapshot
       (authoritative event → applies even if pendingCommit is set;
        still skips if a drag is open, because dropping a drag mid-undo
        would corrupt the proxy state)
   │
   ▼  cursor update → updateFloorPlanHistoryCursor releases the lock
```

### 5.3 Hard rules (do NOT break these)

The rules below all map to bugs we have already paid for. Each one has a `Why:` so you can judge edge cases instead of blindly memorizing.

**R1. Do not change the order or set of short-circuits in the publish effect.**
The eight checks at the top of the publish effect (sections marked `short-circuits in this order` above) are sequence-sensitive. The dedup check before `hasUserEditedRef` is what stops infinite re-publish on remote echo. The `depth > 0 → defer` check before `consumePendingCommand` is what stops mid-drag publishes.
*Why:* Reordering once published a partial drag, which the server then echoed back over the in-progress drag, which then re-published, locking the save status at `syncing` forever.

**R2. Do not call `consumePendingCommand()` unless you are definitely going to publish in the same tick.**
The drain is destructive. If you consume and then return early (e.g. `if (!workspaceCommand) return`), the command is gone — the entity edit silently never reaches the server.
*Why:* Every entity helper in `useWorkspaceCommandPublisher.ts` writes to `pendingCommandRef` with last-write-wins semantics. A lost command means an edit that the local UI shows but the server (and other clients, and the worker) never see.

**R3. Do not skip the `depth > 0 → pendingWorkspaceSnapshotCommitRef = true` branch.**
During a drag, the publish effect MUST defer. Publishing every onMove call would send hundreds of half-states.
*Why:* drag-start increments depth in `beginWorkspaceSnapshotTransaction`; drag-end decrements via `commitWorkspaceSnapshotTransaction`. The cursor handler also reads this depth before declaring `synced` — if depth > 0 it stays `dirty`. If you bypass the defer, the cursor will arrive for state-A while the user is dragging state-B, the cursor handler will think A is the latest, and undo will jump back to A.

**R4. Do not call `replaceFloorPlanState` for a narrow edit. Use the functional updater `updateFloorLayers((current) => ...)`.**
`replaceFloorPlanState` replaces the whole floor-plan state object (layers + activeLayerId + isGenerated + layoutSource). Any concurrent change in another callback gets clobbered.
*Why:* This bit us in `syncFloorRoomFromIfcSpaceTranslation` — a 3D drag would replace floor-plan state, overwriting a 2D edit that landed in the same render window. Fix is `updateFloorLayers((current) => current.map(...))` (see `useFloorPlan.ts:374`).

**R5. Do not change `historyDomain` resolution without also fixing every cursor handler.**
`resolveServerHistoryDomain(publishSnapshot)` decides `'bubble'` vs `'floorPlan'`. The server routes the command and the cursor update by this domain. If a floor-plan edit gets tagged `bubble`, the bubble cursor advances and the floor-plan cursor doesn't; subsequent floor-plan undo replays a stale state.
*Why:* The two domains have independent cursors (`bubbleHistoryBaseIndexRef`, `floorPlanHistoryBaseIndexRef`) and the awaiting record stores `historyDomain` so the cursor handlers know which one to clear. Mismatched domain → `awaitingServerSyncRef` never clears → status stuck at `syncing` → 5.2 timeout kicks in only for bubble domain (floor-plan domain is intentionally exempt because IFC processing can take >5s).

**R6. Do not set `previousSnapshotRef` to anything other than a serialized snapshot that the server has confirmed (or one we are intentionally treating as the new baseline).**
Three legitimate sites: (a) the publish-effect dedup-seed when `!hasUserEditedRef`, (b) the cursor handler when `awaitingServerSync` matches, (c) the `suppressNextAutosaveRef` path after applying a remote snapshot. That's it.
*Why:* Setting it prematurely means the next identical local edit hits the dedup short-circuit and is silently dropped. Setting it from a remote snapshot we just applied is correct (suppress the autosave echo); setting it from a snapshot we haven't sent yet is wrong.

**R7. Do not bypass `hasLocalFloorPlanEditInFlight` in `applyRemoteFloorPlanSnapshot`.**
The gate `depth > 0 || (pendingCommit && !isAuthoritativeFloorPlanEvent)` exists so a server echo of someone else's edit does not clobber the user's in-progress drag. The exception for authoritative events (FLOOR_PLAN_UPDATED/UNDO/REDO) is what makes undo/redo actually apply even when we have a pending commit.
*Why:* Removing this gate causes "ghost reverts" — user is mid-drag, a stale server snapshot arrives, the room snaps back to its old position mid-drag.

**R8. Do not call `setSaveStatus('synced')` directly anywhere except the cursor handler and the publish-effect short-circuit paths.**
`synced` means "the server cursor has advanced to a state that includes our last edit." Calling it from anywhere else lies to the user about persistence.
*Why:* Bubble debug code used to set `synced` after `setTimeout(0)` to make the UI feel snappy — it desynced the indicator from actual persistence and made real save failures invisible.

**R9. Do not introduce a second STOMP publish path. All publishes go through `workspaceRealtime.service.publishJson`.**
`publishJson` is where payload-size telemetry (`stomp-publish-size`), the floor-plan-update warning gate (4MB), and the `ensureStompConnected()` retry live.
*Why:* A direct `client.publish()` call would bypass the warn-at-64KB / error-at-4MB instrumentation that's the only signal we have before a payload trips the Tomcat WebSocket close code 1009.

**R10. Do not add new behavior conditional on `mode === '3d'` without verifying the 2D path.**
The mode is set by the user toggle and persists across renders. A `mode === '3d'` branch that mutates state but doesn't have a 2D counterpart will silently leave 2D out of sync. Same for the inverse.
*Why:* The IfcSpace move publish now routes through `updateRoom` with `affectedElementGlobalIds`; this only works because the 2D layer ALSO listens to room translation. Adding a 3D-only state-write without the 2D sync is exactly how 2D and 3D drift apart.

**R11. Do not change the IFC-storage-URL echo branch (`shouldApplyFloorPlanLayoutOnly` in `useBubbleSnapshotRealtime.ts`) without checking both the bubble-snapshot apply path AND the floor-plan layout apply path.**
The contract: a `floorPlanUpdated` event whose payload carries an `ifcStorageUrl` is an IFC re-render echo, not a bubble update. Apply the layout (so 2D snapshot reflects the worker's output) but skip the bubble-snapshot apply (which would clobber active drafts).
*Why:* The original code skipped the WHOLE snapshot for IFC echoes. That made 2D layout silently miss worker edits. The current `layoutOnly` meta is the precise version of that fix.

**R12. Do not add temporary `console.log` / performance markers and commit them.**
Every observability hook we leave behind becomes load-bearing the moment someone tries to read the console. We have already had to chase imports of a deleted `ifcMovePerformance` module because a debug commit re-introduced it.
*Why:* `markIfcMovePerformance` was reintroduced by commit `73211cb8` and then removed by `b4a54006` — a wasted round-trip. If you need temporary instrumentation, gate it on `import.meta.env.DEV` AND remove before the PR.

**R13. Do not call `setWorkspacePhaseStatus` or `setSaveStatus` from inside a render. Only from event handlers, effects, or the publish-effect short-circuits.**
A render-time write triggers an immediate re-render with a stale ref, which often re-triggers the publish effect.
*Why:* The publish effect reads refs directly, not state. A render-time setState that recomputes `mode` or `phaseStatus` can flip a short-circuit on the next tick.

**R14. Do not remove `clearServerPublishRetry()` calls in the publish or error paths.**
The retry timer is single-shot; if you publish a new snapshot without clearing the retry for the previous one, both fire and the server gets a duplicate.
*Why:* The retry is keyed by `pendingServerPublishRef.serializedSnapshot`. If the new publish replaces the record but the timer still holds a closure on the old record, it republishes the old snapshot.

### 5.4 Where each ref is written (single sources of truth)

If you find yourself writing one of these refs from a new location, stop and verify with the table:

| Ref | Allowed writers |
|---|---|
| `hasUserEditedRef = true` | every `markLocal{Bubble,FloorPlan}SnapshotChanged`, `beginWorkspaceSnapshotTransaction`, manual save, initial-load completion |
| `hasUserEditedRef = false` | publish effect after `synced`, remote-snapshot apply, project switch reset |
| `previousSnapshotRef = <serialized>` | publish effect (dedup seed), cursor handler (own-publish match), suppressNextAutosave path |
| `previousSnapshotRef = null` | server error (non-retriable), cursor-invalid handlers, project switch reset |
| `workspaceEditTransactionDepthRef` | `begin/commit/flushOpenWorkspaceSnapshotTransaction`, project switch reset |
| `pendingWorkspaceSnapshotCommitRef = true` | publish effect's depth>0 branch |
| `pendingWorkspaceSnapshotCommitRef = false` | `requestWorkspaceSnapshotCommit`, cursor handler, project switch reset |
| `pendingServerPublishRef` | publish effect (set), cursor handler (clear on match), error handler (conditional clear) |
| `awaitingServerSyncRef` | publish effect (set), cursor handler (clear on match), error handler (clear), cursor-invalid handlers |
| `pendingCommandRef` (publisher) | every entity helper (`updateWall`, `createRoom`, …), `consumePendingCommand` (drain), `markSnapshotOnlyChange`, `clearPendingCommand` |
| `floorPlanHistoryCommandInFlightRef` | undo/redo trigger (true), cursor update (false), error handler (false), cursor-invalid (false) |

### 5.5 Before-you-merge checklist for any realtime/history change

State which of these you touched. If you can't say "didn't touch" with confidence, manually test it:

- [ ] Snapshot dirty marking (`markLocal*SnapshotChanged`, `hasUserEditedRef`).
- [ ] Pending command creation/consumption (any `pendingCommandRef.current = ...` or `consumePendingCommand` call).
- [ ] STOMP publish timing (anything that calls `publishJson` or sets `pendingServerPublishRef` / `awaitingServerSyncRef`).
- [ ] Server echo handling (`applyRemoteFloorPlanSnapshot`, `applyRemoteBubbleSnapshot`, the `floorPlanUpdated` branch in `useBubbleSnapshotRealtime`).
- [ ] History cursor updates (`updateBubbleHistoryCursor`, `updateFloorPlanHistoryCursor`, `refreshHistoryCursorFromServer`).
- [ ] 2D vs 3D state divergence (any `mode === '3d'` or `'2d'` branch that writes state).
- [ ] IFC URL / revision application (`ifcRevisionByProjectId`, `currentIfcUrl`).
- [ ] Transaction depth (any place that calls `begin*`/`commit*`/`flushOpen*`).

Then manually verify the full matrix:

1. **2D bubble add → undo → redo.** Status must reach `synced` after each step.
2. **2D room move (drag) → undo → redo.** Drag should NOT publish mid-move; status should hit `syncing` only on drag-end.
3. **2D wall endpoint drag → undo → redo.** `startMm` and `endMm` must both be present in the published command (BE drops the op otherwise).
4. **2D opening drag along wall → undo.** Snap behavior preserved.
5. **3D IfcSpace translate → 2D layout reflects.** The room moves in 2D after the 3D drag commits.
6. **3D Wall / Slab / Roof translate / rotate → undo → redo.** No worker DLQ. No "이전 3D 편집 저장이 아직 완료되지 않았습니다" toast.
7. **3D delete element.** Server `delete_elements` operation has non-empty `parameters` (the `reason` field).
8. **Floor add → switch to 3D → IFC re-renders with new storey.** Floor panel consistent in both modes.
9. **Hard refresh during `syncing`.** State recovers; latest IFC + cursor restored.
10. **Two tabs open on same project.** Tab A edits, tab B sees the update; tab B's local drag in progress is NOT clobbered by tab A's echo.

### 5.6 Things that look safe but aren't

- **"Just add a `setSaveStatus('dirty')` here so the UI updates."** The status is derived from refs by the publish effect and cursor handler. A direct write races with the effect and ends up wrong on the next tick. Mark `hasUserEditedRef = true` and tick the commit version instead.
- **"Just `replaceFloorPlanState` to apply this remote layout."** Use `applyFloorPlanLayoutState` (the existing helper) or `updateFloorLayers` functional updater. `replaceFloorPlanState` is the right call only for full snapshot-replacement (project load, undo to baseline, remote authoritative snapshot).
- **"Just `client.subscribe(...)` directly for this one topic."** Use `subscribeStompTopicsWithPolling`. Direct `client.subscribe` bypasses the shared-subscription dedup and the listener exception guard, so one broken handler can kill every other subscriber on the same topic.
- **"Just check `client.connected` and publish."** Use `ensureStompConnected()`. It also handles the singleton state, HMR-disposed clients, and the post-disconnect race where `client.connected` is true but the WebSocket is closing.
- **"`mode === '3d'` is fine as a gate — 2D won't see this code path anyway."** It will. Mode-switch is a state change, not an unmount. The next 2D render reads the SAME refs you wrote in 3D. Any 3D-only state write must have a 2D mirror or be no-op in 2D explicitly.
- **"This is debug-only — wrapping in `if (import.meta.env.DEV)` is enough."** Yes for logs. No for side-effect helpers (perf marker imports, eager telemetry singletons). The import itself ships in prod unless tree-shaken, and if you delete the helper file later the import breaks the build.

### 5.7 When you genuinely have to change this area

1. Re-read 5.1, 5.2, and 5.3 before writing any code.
2. State explicitly which refs your change writes, which short-circuits it adds/removes, and which of the 10 manual scenarios in 5.5 it could affect.
3. Prefer a focused helper inside an existing hook over inline logic in `useEditorPage.ts`. `useEditorPage.ts` is already ~6k lines; resist growing it.
4. If you find yourself duplicating one of the cursor/awaiting/pending checks, that's a sign your change belongs in `useWorkspaceHistorySyncController` or `useWorkspaceRemoteSnapshotHandlers`, not in the orchestrator.
5. Manual-test the full 10-scenario matrix. The unit tests in this area do not catch race conditions between the publish effect, the cursor handler, and the remote-snapshot handler.
