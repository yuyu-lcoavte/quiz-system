# US2 Manual Data Model Acceptance

This acceptance guide covers shared storage relationships and transactions only. It does not implement Teacher import workflows, Student enrollment/submission APIs, winner selection, or US3 realtime synchronization.

## Run the isolated acceptance suites

From the repository root in PowerShell:

```powershell
npx vitest run tests/integration/data-model.test.ts tests/unit/model-validation.test.ts
npx vitest run tests/integration/submission-result.test.ts tests/integration/foundation-persistence.test.ts
```

Each test suite creates uniquely named SQLite files under the operating system temporary directory, enables Foreign Keys on each connection, and removes its files after each test. These commands do not open or modify the normal development database under `data/`.

## Acceptance scenarios

1. **Empty Session**: Create a Session before adding a Round or Team. Confirm its `currentRoundId` is null, `stateVersion` is zero, and Round/Team lists are empty.
2. **Question and Blank cardinality**: Create one Question with no Blanks and another with multiple Blanks. Confirm both are stored and blanks retain their independent IDs and positions.
3. **Incomplete QuestionGroup**: Create a QuestionGroup with no Questions. Confirm it can be read as incomplete data, but creating a Round targeting it is rejected without inserting a Round or changing Session state.
4. **Populated QuestionGroup**: Add Questions to a group and confirm the group lists them in configured position order. Confirm a Round can target the populated group.
5. **Round target integrity**: Create a Round with one Question target and another with one QuestionGroup target. Attempt neither target, both targets, or a target from a different Session. Confirm each invalid attempt is rejected.
6. **Reopen**: Create a Waiting Round for a target, then create another Waiting Round for the same target with the next expected `stateVersion`. Confirm the new Round has a different ID, remains Waiting, becomes `currentRoundId`, and increments the version; the historical Round remains stored.
7. **Team and Submission constraints**: Create a Team and Round in one Session and one Submission. Confirm a second Submission for the same Team/Round and a duplicate `acceptedOrder` within the Round are rejected. Confirm a Team from another Session cannot submit to the Round.
8. **acceptedOrder ownership**: The persisted field and per-Round unique constraint are part of Foundation storage. A future Student Feature trusted backend submission service must generate this value from actual acceptance order. No Student submission API exists in this Foundation phase, and client-provided values are not authoritative.
9. **Answer-to-Blank integrity**: Store answers for Blanks in a direct Question or a member Question of the target group. Confirm answers outside the Round target are rejected and returned in Question/Blank position order.
10. **Result integrity and replacement**: Confirm a Result cannot use a Submission from another Round. Complete a later Round with a supplied winning Submission; confirm the previous logical-target Result is replaced and the new Result points to the new Round.
11. **Atomic rollback**: Cause a Round/current-Session compare-and-swap failure and a Result replacement with an invalid winner. Confirm the inserted Round or prior Result deletion is rolled back. In the combined Ended/Result transaction, confirm a bad winner leaves the Round Active and preserves the old Result; a valid supplied winner commits Ended and the replacement Result together.
12. **Development database isolation**: Confirm the test database path is under the OS temp directory and does not include the project `data/` location. The temporary test helper refuses to run unless `NODE_ENV=test`.

## Expected limits

- SQLite Constraints and triggers are the final persistence boundary. Domain validation runs before the shared Round/Result transaction and reports invalid relationships without relying on client state.
- Foundation persists `acceptedOrder` and its uniqueness but does not generate order, determine correctness, or select a winner.
- Foundation stores empty QuestionGroups as incomplete data, but rejects one as a Round target until it contains at least one Question.
- Tests exercise the isolated database layer. They do not create business APIs or import/parse Guided Notes Excel files.
