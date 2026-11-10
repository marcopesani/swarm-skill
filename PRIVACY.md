# Privacy

Swarm is a set of instructions and a local script. It has no server and no telemetry, and it
collects nothing. The maintainers receive no data from your use of it.

When you run it:

- **OpenRouter.** The lead checks your key's limit and spend at `https://openrouter.ai/api/v1/key`.
  Workers send prompts and code from your repository to the models you choose, through OpenRouter.
  [OpenRouter's privacy policy](https://openrouter.ai/privacy) and the policies of the model
  providers apply. To limit which providers can see your code, set data policies on your
  OpenRouter account.
- **Your machine.** The team's state (the SQLite database, worker logs, worktrees) stays in
  `~/.swarm` or the folder you pick. If you follow `references/persistence.md`, a dump of the
  database goes into a private Claude artifact or a file you choose.
- **Installers.** Tools you use to install the skill, such as `npx skills`, may collect their own
  anonymous usage data. See their documentation. For `npx skills`, set `DISABLE_TELEMETRY=1` to turn it off.

Questions: [open an issue](https://github.com/marcopesani/swarm-skill/issues).
