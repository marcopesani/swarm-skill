# Keeping the database across sessions

A cloud container is temporary. The database is the team's whole memory, so
back it up as a SQL dump. Workers never touch the backup; only you do.

## In Claude Code: the "Swarm State" artifact

The dump lives as an asset of one private artifact titled **Swarm State**.

Find it once per session: run Artifact action `list` (limit 200) and look for
that title. If there is none, write a small page with `<title>Swarm State</title>`,
publish it with capabilities `{"assets": {}}` and icon `database`, and use its URL
from then on.

**Import** (at the start, before you create tables, and only when
`sqlite3 $SW/swarm.db .tables` printed nothing):
1. Artifact action `list`, scope `assets`, url = the artifact. The list is
   oldest first: take the last entry.
2. Artifact action `read`, url = the artifact, path = that asset id. It saves
   the file and returns its path.
3. `sqlite3 <dir>/swarm.db < <saved file>`, then apply `assets/schema.sql` (it only
   adds what is missing).

**Export** (after each merge, at milestones, and always before you end):
1. `sqlite3 <dir>/swarm.db .dump > <dir>/swarm-dump.txt` (keep the `.txt`
   name: it uploads as text/plain).
2. Artifact publish with url = the artifact, file_path = that file, `asset: true`.
3. Delete the previous dump (Artifact action `delete`, url, path = old asset id),
   so only the newest stays.

## Elsewhere

Without the Artifact tool, keep `<dir>/swarm-dump.txt` yourself: export the
same way and copy the file somewhere that outlives the machine. If you cannot,
tell the user that the team's state ends with this session.
