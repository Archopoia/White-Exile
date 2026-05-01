# Example directory structure

Typical layout for a game repo — **adapt names and folders to your project**.

```text
/
├── README.md                    # Project overview and how to run
├── .cursor/                     # Cursor rules, agents, skills, studio docs
├── src/                         # Source code (layout varies by stack)
├── assets/                      # Art, audio, data (optional naming)
├── design/                      # GDD, narrative, balance notes
├── docs/                        # Technical documentation
├── tests/                       # Automated tests
├── tools/                       # Pipelines, CI helpers
├── prototypes/                  # Throwaway experiments (optional)
└── production/                  # Sprints, milestones (optional)
```

Some teams keep a single **AI or contributor index** at the repo root (for example `AGENTS.md`); others use only `README.md` and `docs/`. Pick one canonical place and keep it current.
