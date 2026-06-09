Git is a content-addressable store of snapshots. Every object — blob, tree, commit — is identified by the SHA-1 hash of its content. Branches are not containers of commits; they are lightweight pointers to a single commit node in a DAG.

## The core

**The object model.** Git stores four object types:
- **blob** — raw file content, no filename
- **tree** — a directory listing: name → SHA of blob or subtree
- **commit** — a snapshot: pointer to a root tree, author, message, and zero or more parent commit SHAs
- **tag** — annotated label for a commit

A `git commit` doesn't diff files. It takes the current index (staging area), writes blobs for changed files, writes trees for changed directories up to the root, then writes a commit object pointing to that root tree and to the previous commit. The "history" is the graph you get by following parent pointers.

**Branches and HEAD.** A branch like `main` is a file in `.git/refs/heads/main` containing one SHA — the tip commit. `git checkout main` sets `.git/HEAD` to `ref: refs/heads/main`. After a new commit, the branch file is updated to the new SHA. This is why branches are cheap to create and instant to switch — no data is moved, only a pointer file changes.

**Rebase vs merge.** A `merge` creates a new commit with two parents — the DAG stays honest about parallel development. A `rebase` replays commits from one branch onto another, rewriting their parent pointers (and thus their SHAs — rebased commits are new objects). Rebase produces a linear history that's easier to `git log` and `git bisect`, but it rewrites history — which is safe only on commits not yet pushed to a shared branch.

**`reflog` — the safety net.** Every time HEAD moves, Git appends an entry to `.git/logs/HEAD`. Even after `git reset --hard` or an accidental `git branch -D`, the commits are still in the object store (until GC). `git reflog` shows the recent HEAD positions; `git checkout <sha>` recovers them.

```bash
# Inspect the object model directly — understand what Git actually stores
$ git cat-file -t HEAD              # "commit"
$ git cat-file -p HEAD              # shows the commit object: tree SHA, parent SHA, author
$ git cat-file -p HEAD^{tree}       # the root tree: mode, type, SHA, name for each entry
$ git cat-file -p <blob-sha>        # raw file content

# Visualise the DAG
$ git log --oneline --graph --all --decorate

# Interactive rebase: squash, reorder, edit commits before pushing
$ git rebase -i origin/main         # opens editor; mark commits squash/fixup/edit

# Rebase a feature branch onto updated main — replays your commits on top
$ git fetch origin
$ git rebase origin/main            # replays feature commits on top of fresh main

# Merge — preserves both histories, honest about what happened
$ git merge --no-ff feature/my-branch   # --no-ff forces a merge commit even if fast-forward is possible

# Recovery: find a commit "lost" after reset
$ git reflog
# e.g. HEAD@{3}: commit: feat: add streaming support
$ git checkout HEAD@{3}            # detached HEAD at the lost commit
$ git branch recover/streaming     # make a real branch from it

# Bisect: binary-search for the commit that introduced a bug
$ git bisect start
$ git bisect bad                   # current commit is broken
$ git bisect good v1.0.0           # last known good
# Git checks out the midpoint; you test and mark good/bad until it isolates the commit
$ git bisect run pnpm test         # automate with a test command
```

```bash
# .gitconfig: useful aliases for daily workflow
[alias]
  lg    = log --oneline --graph --all --decorate
  fixup = commit --fixup          # creates a fixup! commit for interactive rebase --autosquash
  undo  = reset --soft HEAD~1     # undo last commit, keep changes staged
  wip   = commit -m "wip"         # quick save
```

## In your project

Git's DAG model explains every CI/CD behaviour you rely on: GitHub Actions triggers on `push` events that reference a commit SHA, not a branch name. When Turborepo computes whether to use a cached build, it hashes source files — which are ultimately blobs in Git's object store. Understanding that a branch is just a pointer explains why `git push --force` on `main` is destructive: it moves the pointer backwards, orphaning commits that CI has already run against.

## Tradeoffs & pitfalls

**Rebase on shared branches.** Rebasing rewrites SHAs. If you rebase commits that a colleague has already pulled, their Git history diverges from yours — their `git pull` will fail or produce a confusing merge. Rule: rebase only on commits that exist solely on your local or personal feature branch; merge once a branch is shared.

**Squashing too aggressively.** Squashing every feature branch into one commit before merging makes `git log` tidy but destroys the investigative value of intermediate commits. `git bisect` can't isolate a bug to a 3,000-line squash commit. Squash noise (fixup commits, typo corrections) but preserve logical steps.

**`.gitignore` gaps.** Committing `node_modules`, `.env`, or build artifacts pollutes the object store permanently — even after deletion, the data remains in history. Use `git filter-repo` (not `git filter-branch`) to purge sensitive data from history.

**Large binary files.** Git stores complete content of every version of every file. A committed 50MB image creates a permanent 50MB blob. For binaries, use Git LFS (Large File Storage), which stores a pointer in the repo and the binary in an LFS server.

## Top-1% insight

`git bisect run` is the single most underused power feature. Given a test that exits 0 when the bug is absent and 1 when it's present, `git bisect run` binary-searches your entire commit history automatically — identifying the exact commit that introduced a regression in O(log n) steps with zero manual intervention. For a 1,000-commit history, that's 10 checkouts. It transforms "the bug appeared sometime in the last month" from a day's work into a five-minute automated procedure. This is what distinguishes engineers who can confidently debug production regressions from those who resort to `git log` archaeology.
