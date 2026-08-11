# Matching rules

Individual scoring rules live here, one module per rule, each implementing the
`MatchingStage` interface from `../matching.types.ts`.

**Nothing in this directory is implemented yet.** It exists so the first rule has
an obvious home and so rules stay separable and independently testable.

Planned modules:

| Module              | Stage        | Responsibility                                                   |
| ------------------- | ------------ | ---------------------------------------------------------------- |
| `hard-filters.ts`   | Hard filter  | Disqualify on set-aside eligibility, contract value, geography    |
| `naics-overlap.ts`  | Rule scoring | Score NAICS/PSC intersection, weighting the client's primary code |
| `keyword-match.ts`  | Rule scoring | Apply positive keyword boosts and negative keyword penalties      |
| `agency-affinity.ts`| Rule scoring | Reward the client's preferred agencies and past performance       |

Guidelines:

- A rule is a pure function of `(MatchableClient, MatchableOpportunity)`. It must
  not query the database — the caller assembles the projections.
- Every rule returns its `reasons`, so a score can always be explained in the UI.
- Rules must never invent a score for data they do not have; return `0` with an
  empty reason list and let the pipeline decide how to weight the stage.
