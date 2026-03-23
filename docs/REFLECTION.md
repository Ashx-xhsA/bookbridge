# HW4 Reflection: Claude Code Workflow and TDD

## How the Explore, Plan, Implement, Commit Workflow Compares to My Previous Approach

Before using the structured E->P->I->C workflow, my development process was much
more ad hoc. I would typically open a file, start coding immediately, and figure
out the architecture as I went. When something did not fit, I would refactor in
place, sometimes losing track of why I made certain decisions.

The E->P->I->C workflow forced a deliberate separation of concerns between
understanding and doing. During the Explore phase, I read through all 171 lines
of `legacy/split_book.py` and 243 lines of `legacy/merge.py`, documenting what
each function did, what was reusable, and what needed to change. Writing these
findings to `docs/explore_ingestion.md` before clearing context meant I had a
reference I could revisit at any time.

The Plan phase was similarly valuable. Instead of jumping into code, I wrote out
a clear 4 step plan in `docs/plan_ingestion.md`. This caught a dependency I would
have missed: the chunker needed the models module to exist first. Having the plan
saved to a file meant that even after `/clear`, I could reload exactly what I
intended to build.

The biggest benefit was in the Commit phase. Because each phase produced a distinct
commit (`explore:`, `plan:`, `feat:`), the git history tells the story of how and
why the code was written, not just what changed. Reviewing PR #4 months later, anyone
can see the reasoning that led to the implementation. My old approach produced
git histories like "WIP", "fix stuff", "more changes" which were useless for review.

## Context Management Strategies That Worked Best

### Saving state to files before /clear
The single most effective strategy was writing exploration findings and implementation
plans to markdown files in `docs/` before running `/clear`. This turned ephemeral
context into persistent knowledge. After clearing, I could re-read only what was
needed, keeping the context window focused on the current task.

### @import references in CLAUDE.md
Having `@import docs/PRD.md` and `@import docs/API_DESIGN.md` in CLAUDE.md meant
that project context was always available without manual re-loading. The PRD kept
the problem statement and user personas accessible, while the API design doc served
as a contract for what functions needed to exist.

### Phase-based context boundaries
Clearing context between Explore, Plan, and Implement prevented the context from
growing stale. During implementation, I did not need the raw exploration notes
cluttering the window because the plan already distilled them into actionable steps.
Each phase started clean and focused.

### What did not work as well
I initially tried keeping everything in one continuous session. By the time I
reached implementation, the context included all the exploration output plus the
plan, and responses were slower and occasionally referred to outdated details.
Aggressive `/clear` between phases fixed this.

## TDD Insights

### The discipline of writing tests first changes how you think about code

Writing tests before implementation forced me to think about interfaces and edge
cases before writing any production code. For example, when writing `TestIsNoiseLine`,
I had to decide: should an empty string be noise? What about a single character?
These boundary decisions were made explicitly in test cases rather than implicitly
in if-else branches.

### Red-green-refactor creates natural commit points

Each TDD cycle produced exactly 3 commits with clear intent:
- `test(red)`: the specification (what should the code do?)
- `feat(green)`: the minimum implementation (make it work)
- `refactor`: the improvement (make it right)

This was much cleaner than my old habit of mixing test and implementation changes
in a single "add feature X" commit. Anyone reviewing the git history can see the
progression from specification to implementation to polish.

### The RED phase catches design issues early

During TDD Cycle 1, I wrote a test for OCR variations: `is_running_header("EMBA SYTOWN")`.
When I implemented the code, this test failed because the regex pattern did not
account for OCR artifacts inserting spaces. Catching this at the test level (rather
than discovering it in production) was exactly the value of TDD. The fix was a
one line regex change, but finding it would have been much harder in a larger codebase.

### AI assistance works best when the human defines the spec

The workflow of "human writes tests, AI implements code" aligns well with how Claude
Code works. I defined the behavior I wanted through test cases (the hard, creative
part), and let the AI generate the implementation to satisfy those tests (the
mechanical part). This kept me in control of the design while leveraging AI for
the repetitive coding work.

### Coverage as a confidence metric

Running `pytest --cov` after each TDD cycle gave immediate feedback on what was
and was not tested. The final suite had 43 tests with 68% overall coverage (and
92% to 100% on the modules I developed with TDD). The untested code was primarily
the CLI entry point and config module, which are integration concerns best tested
differently.
