# Shared Foundation Data Model

This design uses SQLite primary/foreign keys and shared TypeScript DTOs. IDs are opaque UUID strings; display numbers and positions are labels, never identifiers. Timestamps are UTC ISO-8601 at the API boundary and stored in a consistent UTC representation.

## Entities

| Entity | Planned fields | Keys and validation |
|---|---|---|
| Session | `id`, `activityCode`, `currentRoundId?`, `stateVersion`, `createdAt` | `id` primary key; `activityCode` unique, normalized before lookup; `currentRoundId` nullable and references Round. New Session has no Round and is Waiting by interpretation. A Session may initially have zero Teams. |
| Round | `id`, `sessionId`, `questionId?`, `questionGroupId?`, `phase`, `createdAt`, `startedAt?`, `endedAt?` | `id` primary key; `sessionId` foreign key; exactly one of `questionId` or `questionGroupId` is non-null; phase is Waiting, Active or Ended. A Question or QuestionGroup can have multiple historical Rounds. |
| Question | `id`, `sessionId`, `displayNumber?`, `prompt?`, `position` | `id` primary key; `sessionId` foreign key; question order is explicit. May belong to zero or one QuestionGroup. |
| Blank | `id`, `questionId`, `label?`, `position` | `id` primary key; `questionId` foreign key; unique position per Question. A Question may have 0..* Blanks. |
| QuestionGroup | `id`, `sessionId`, `label?`, `position` | `id` primary key; `sessionId` foreign key; contains one or more Questions when configured as a submission target. |
| Team | `id`, `sessionId`, `name`, `createdAt` | `id` primary key; `sessionId` foreign key; name is display data, not identity. Session may have zero Teams initially. |
| Participant | `id`, `teamId`, `displayName?`, `createdAt` | `id` primary key; `teamId` foreign key. Login/session credential and enrollment lifecycle are owned by Student Feature. |
| Submission | `id`, `teamId`, `roundId`, `receivedAt`, `acceptedOrder` | `id` primary key; exactly one Team and Round; unique `(teamId, roundId)` enforces one successful submission by a Team per Round; unique `(roundId, acceptedOrder)` provides backend ordering. Creation/authorization belongs to Student Feature. |
| SubmissionAnswer | `submissionId`, `blankId`, `value` | Composite primary key `(submissionId, blankId)`; links independently entered answers to Blank records; this supports zero or multiple blanks without fixed counts. |
| Result | `id`, `roundId`, `winningSubmissionId`, `createdAt` | One Result at most per Round; winner must be a Submission from the same Round. On completion of a new Round for the same Question/QuestionGroup, prior Result for that logical target is deleted and replaced transactionally. |

## Relationships

- Session 1 — 0..* Round; every Round belongs to exactly one Session.
- Session 1 — 0..* Team; every Team belongs to exactly one Session.
- Session 1 — 0..* Question and QuestionGroup (questions and groups are imported/configured by Teacher Feature).
- Question 1 — 0..* Blank; each Blank belongs to exactly one Question.
- QuestionGroup 1 — 1..* Question when a group is configured; a Question can be standalone or belong to 0..1 group.
- Round targets exactly one Question XOR one QuestionGroup. One target may have multiple Rounds.
- Team 1 — 0..* Participant and Submission.
- Round 1 — 0..* Submission and 0..1 Result.
- Result selects exactly one winning Submission from its Round.
- Submission 1 — 0..* SubmissionAnswer; each answer targets one Blank.

## Lifecycle and Constraints

1. A Session without a current Round is Waiting.
2. Choosing a new target or reopening a target creates a new Round in Waiting and updates `currentRoundId`.
3. Start changes the current Round from Waiting to Active; End changes Active to Ended.
4. `stateVersion` increments on every observable session phase/current-round change in the same transaction.
5. Submission uniqueness and `acceptedOrder` are enforced in the database transaction in later Student Feature; server arrival order is authoritative.
6. A Question with no Blanks remains valid domain data under FR-005. Student Feature must reject submission for an unanswerable target.
7. Result replacement is atomic: after the new Round has a winner, remove the old Result for the same logical target and insert the new Result. No old-result version query is exposed.
8. Enable SQLite foreign keys for every connection; use `CHECK` for Round target XOR and phase values; use transactions for state and result changes.

## TypeScript Contract Concepts

`SessionSummary`, `RoundSnapshot`, `QuestionView`, `BlankView`, `QuestionGroupView`, `TeamView`, `ParticipantContext`, `SubmissionView`, `ResultView`, `ActorContext`, `ApiError` and `SessionStateSnapshot` are shared contract concepts. Concrete TS definitions are implementation artifacts and belong to later implementation, not this plan document.
