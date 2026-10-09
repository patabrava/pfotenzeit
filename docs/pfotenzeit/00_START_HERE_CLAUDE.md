# Start here — Claude execution prompt

Copy the prompt below into Claude and attach the complete folder or ZIP, including its three PNG reference sheets. Do not attach only this file: the linked documents contain the actual game specification. The user's chosen Claude model is an execution preference; this package assumes no particular model capabilities or tool integrations.

## Paste-ready prompt

> Build the Pfotenzeit playable prototype from the attached handoff. You are responsible for implementation and the 3D asset workflow. Use plain Three.js, TypeScript and Vite, with HTML/CSS/DOM UI. The game is a mobile-first touch web app in German; communicate with me in English. Start by reading CLAUDE.md, 14_CLAUDE_EXECUTION.md and the documents they reference. Create actual files and a runnable game, not just a plan.
>
> Implement a complete first lesson with temporary recognizable 3D dogs before polishing assets. Continue through the defined MVP: three lessons, puppy care, a separate pixel-style profile sharing the same dog state, bonding memories, two school upgrades, one growth step, local persistence, and the optional isolated Tamagotchi challenge. Standard mode has no offline penalties. Offline time alone can never kill the challenge puppy. Follow the exact care/time and transaction rules.
>
> Use the character PNGs as visual references, not runtime models. Generate or prepare proper GLBs if your tools support it. If model-generation access is unavailable, keep developing with clearly labeled procedural placeholders and produce the exact model-production tickets; do not pretend placeholder geometry is the final character art. Do not block the playable slice on external credentials or perfect art.
>
> Follow 11_QA_ABNAHME.md and 17_EXECUTION_CHECKLIST.md. Report commands actually run, tests actually passed, measured performance, unfinished asset work and other limits. Select compatible current dependency versions from official documentation and lock them. Do not invent book content, completed testing, or tool access. The book mapping is provisional and does not block the three prototype lessons.
>
> Start work now. Preserve existing repository changes if present. Maintain PROGRESS.md and an implementation README so work can resume across context limits. Make routine reversible decisions yourself. Ask only for a genuinely blocking credential or missing requirement; continue all independent work. Do not deploy, publish, spend money on external generation, or create accounts without my explicit authorization.

## If using an existing repository

Place these design documents under docs/pfotenzeit/ and copy the included CLAUDE.md guidance into the project's existing Claude instructions without overwriting unrelated rules. If the tool does not automatically read CLAUDE.md, explicitly load it. In a new empty repository, create the Vite project in the repository root, keeping the handoff under docs/.

## Package map

- [CLAUDE.md](CLAUDE.md): project instructions and precedence.
- [14_CLAUDE_EXECUTION.md](14_CLAUDE_EXECUTION.md): build sequence and Three.js modules.
- [15_DATEN_REGELN.md](15_DATEN_REGELN.md): state, time, content and transaction contracts.
- [16_ASSET_PRODUCTION.md](16_ASSET_PRODUCTION.md): concrete asset tickets and fallbacks.
- [17_EXECUTION_CHECKLIST.md](17_EXECUTION_CHECKLIST.md): deliverables, commands and evidence.

The rest of the original design package remains authoritative for product behavior. No executable scaffold or finished GLB is included in this design handoff.
