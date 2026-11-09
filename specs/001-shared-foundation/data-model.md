# Shared Foundation Data Model

This design uses SQLite primary/foreign keys and shared TypeScript DTOs. IDs are opaque UUID strings; display numbers and positions are labels, never identifiers. Timestamps are UTC ISO-8601 at the API boundary and stored in a consistent UTC representation.

## Entities

| Entity | Planned fields | Keys and validation |
|---|---|---|
| Session | `id`, `activityCode`, `currentRoundId?`, `stateVersion`, `createdAt` | `id` primary key; `activityCode` unique, normalized before lookup; `currentRoundId` nullable and references a Round in the same Session via a composite foreign key. New Session has no Round and is Waiting by interpretation. A Session may initially have zero Teams. |
| Round | `id`, `sessionId`, `questionId?`, `questionGroupId?`, `phase`, `createdAt`, `startedAt?`, `endedAt?` | `id` primary key; unique `(sessionId, id)` supports scoped references; `sessionId` foreign key; exactly one of `questionId` or `questionGroupId` is non-null; phase is Waiting, Active or Ended. Composite foreign keys require the selected Question or QuestionGroup to belong to this Session. A Question or QuestionGroup can have multiple historical Rounds. |
| Question | `id`, `sessionId`, `questionGroupId?`, `displayNumber?`, `prompt?`, `position` | `id` primary key; `sessionId` foreign key; unique `(sessionId, id)` supports scoped references; optional composite foreign key `(sessionId, questionGroupId)` ensures a group belongs to the same Session. Question order is explicit. May belong to zero or one QuestionGroup. |
| Blank | `id`, `questionId`, `label?`, `position` | `id` primary key; `questionId` foreign key; unique position per Question. A Question may have 0..* Blanks. |
| QuestionGroup | `id`, `sessionId`, `label?`, `position` | `id` primary key; unique `(sessionId, id)` supports scoped references; `sessionId` foreign key; may contain zero or more Questions while being created/configured. It is a valid Round target only when it contains at least one Question. |
| Team | `id`, `sessionId`, `name`, `createdAt` | `id` primary key; `sessionId` foreign key; name is display data, not identity. Session may have zero Teams initially. |
| Participant | `id`, `teamId`, `displayName?`, `createdAt` | `id` primary key; `teamId` foreign key. Login/session credential and enrollment lifecycle are owned by Student Feature. |
| Submission | `id`, `teamId`, `roundId`, `receivedAt`, `acceptedOrder` | `id` primary key; exactly one Team and Round; unique `(teamId, roundId)` enforces one effective Submission by a Team per Round; unique `(roundId, id)` supports same-Round Result references; unique `(roundId, acceptedOrder)` persists the per-Round acceptance order. The trusted Student Feature backend submission service generates `acceptedOrder` from actual acceptance order; clients cannot provide an authoritative value. Foundation owns the field and persistence constraint but does not generate it, rank submissions or select a winner. A database trigger requires Team and Round to belong to the same Session. Submission creation/authorization belongs to Student Feature. |
| SubmissionAnswer | `submissionId`, `blankId`, `value` | Composite primary key `(submissionId, blankId)`; links independently entered answers to Blank records; a database trigger requires the Blank's Question to be the Round's direct Question or a member of its targeted QuestionGroup. This supports zero or multiple blanks without fixed counts. |
| Result | `id`, `roundId`, `winningSubmissionId`, `createdAt` | One Result at most per Round; a composite foreign key `(roundId, winningSubmissionId)` requires the winner Submission to belong to that same Round. On completion of a new Round for the same Question/QuestionGroup, prior Result for that logical target is deleted and replaced transactionally. |

## Relationships

- Session 1 — 0..* Round; every Round belongs to exactly one Session.
- Session 1 — 0..* Team; every Team belongs to exactly one Session.
- Session 1 — 0..* Question and QuestionGroup (questions and groups are imported/configured by Teacher Feature).
- Question 1 — 0..* Blank; each Blank belongs to exactly one Question.
- QuestionGroup 1 — 0..* Question while being created/configured; a Question can be standalone or belong to 0..1 group. A group with 0 Questions is valid incomplete data but cannot be a Round target; a configured target requires 1..* Questions.
- Round targets exactly one Question XOR one QuestionGroup. One target may have multiple Rounds.
- A Round's selected Question or QuestionGroup must belong to the same Session as the Round; the Session's nullable `currentRoundId` must also refer to a Round in that Session.
- Team 1 — 0..* Participant and Submission.
- Round 1 — 0..* Submission and 0..1 Result.
- Result selects exactly one winning Submission from its Round.
- Submission 1 — 0..* SubmissionAnswer; each answer targets one Blank.

## Cross-Session and Target Integrity

Use SQLite as the final integrity boundary and Domain Validation inside the owning service/transaction for clear errors before persistence:

| Invariant | SQLite enforcement | Domain/service validation |
|---|---|---|
| Round's Question or QuestionGroup belongs to the Round's Session | Composite foreign keys from `(sessionId, questionId)` / `(sessionId, questionGroupId)` to unique scoped keys; retain the XOR `CHECK`. A trigger rejects using an empty QuestionGroup as a Round target, while allowing the QuestionGroup row itself to remain empty. | Validate the target exists in the selected Session and a QuestionGroup has at least one member before creating the Round. |
| Session's `currentRoundId` belongs to that Session | Composite foreign key from `(id, currentRoundId)` to `(sessionId, id)` on Round; nullable current pointer remains allowed. | Validate current-Round transitions and state version in the same transaction. |
| Submission's Team and Round belong to the same Session | SQLite `BEFORE INSERT/UPDATE` trigger checks the Session IDs, avoiding a redundant `sessionId` field on Submission. | Validate membership before accepting the Student Feature transaction. |
| SubmissionAnswer's Blank belongs to the Round target | SQLite trigger follows Submission → Round and Blank → Question, allowing either the direct Question or a Question in the target QuestionGroup. | Validate the Blank is in the submitted target before storing the answer. |
| Result's winning Submission belongs to its Round | Unique parent key `(roundId, id)` on Submission plus composite foreign key `(roundId, winningSubmissionId)`. | Validate the supplied winner belongs to the completed Round before atomically replacing the Result. |

Enable `PRAGMA foreign_keys=ON` on every connection. Triggers and foreign keys protect writes even if a path bypasses normal application validation; Domain Validation remains responsible for actionable errors. An empty QuestionGroup is not a valid Round submission target and is rejected by Domain Validation before transition creation.

## Lifecycle and Constraints

1. A Session without a current Round is Waiting. `SessionStateSnapshot.changedAt` is derived from persisted timestamps: Session `createdAt` when there is no current Round; otherwise the current Round's `createdAt` in Waiting, `startedAt` in Active, or `endedAt` in Ended. No separate Session state-change timestamp field is required.
2. Choosing a new target or reopening a target creates a new Round in Waiting and updates `currentRoundId`.
3. Start changes the current Round from Waiting to Active; End changes Active to Ended.
4. `stateVersion` increments on every observable session phase/current-round change in the same transaction.
5. Foundation persists `acceptedOrder` and enforces `UNIQUE(roundId, acceptedOrder)` plus `UNIQUE(teamId, roundId)`. The trusted Student Feature backend submission service generates `acceptedOrder` according to actual acceptance order; client input is not authoritative. Foundation does not generate order or determine a winner.
6. A Question with no Blanks remains valid domain data under FR-005. Student Feature must reject submission for an unanswerable target.
7. Result replacement is atomic: after the new Round has a winner, remove the old Result for the same logical target and insert the new Result. No old-result version query is exposed.
8. Enable SQLite foreign keys for every connection; use `CHECK` for Round target XOR and phase values; use transactions for state and result changes.

## TypeScript Contract Concepts

`SessionSummary`, `RoundSnapshot`, `QuestionView`, `BlankView`, `QuestionGroupView`, `TeamView`, `ParticipantContext`, `SubmissionView`, `ResultView`, `ActorContext`, `ApiError` and `SessionStateSnapshot` are shared contract concepts. `Submission.acceptedOrder` is persisted by Foundation but generated only by the trusted Student Feature backend submission service. Concrete TS definitions are implementation artifacts and belong to later implementation, not this plan document.
