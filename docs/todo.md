These are reminders to myself of things that need to be tackled in the project.

## Ensure that sessions are not stored in ~/.config/pi-glider/agent/sessions
This is problematic, because this directory is used to configure pi in the sandbox kali container.
But it is reused between working sessions, as such this could leak data between engagements that the
agent technically could read. We need to make sure sessions are stored in the mounted engagement dir only.
This is likely some config for pi we can tweak.

## We need to think about a good way to fascilitate per-engagement config / improvements
Operators may want to tweak any of the skills, templates, methodology docs, configs etc per-engagement
and even persist those changes. We should figure out a good way to facilitate this, currently changes to
the files either in ~/.config/pi-glider, or ~/.pi/ inside a working container will change the config for
all sessions going forward.

## An idea to further keep the agent on rails and on task
To avoid further rabbit holing, the system prompt is appended, and upon startup and compaction
methodology tips + the main pi-glider skill is reinjected.

However, it might be interesting to also consider doing some kind of tool call hook such that when
the agent is about to or does execute a tool like executing commands, the guiding principles are also
re-injected into this. To triple check keeping the agent focused and directed.

## Make the agent write findings / interesting notes to markdown as it works
The agent should be writing anything interesting, relevant, or potential / concrete findngs to files as it works.
This is super important to make sure details do not get lost to the compaction ether.
This is all about trying to build on a level determinsism and reliability to a fuzzy pattern matching / generating system.

## Reporting skill should use the full contents of the findings
Findings are written to intermediate files which have several important sections.
Reporting should use that content directly when creating the final report document.
Also, it would probably be good to create some separate adapter script that pushes findings
directly to plextrac.

## Generalize APPEND_SYSTEM.md (deferred follow-up #1)
The current `config/APPEND_SYSTEM.md` is pi-glider-specific: it references the Kali container,
`/engagement/RoE.md`, and `/engagement/evidence/`. Generalize it so it is universal and can be
reused outside the pentest container:
- Remove the Kali-container / `RoE.md` / `/engagement/evidence/` specifics.
- Add a way to swap host-vs-container wording (e.g. a small set of variant blocks or a
  per-engagement override) so the same prompt works in container mode and `--no-container` mode.
Keep it minimal and razor-sharp (it is injected every turn).

## Proper packaging / installer (deferred follow-up #3)
`scripts/pi-glider self-install` currently symlinks the CLI into `~/.local/bin`. Replace this with
a real package/installer (e.g. Homebrew tap, npm package, or a single-file installer) so users can
install pi-glider without cloning the repo. Decide the distribution story and document it in the
README.
