/**
 * Which repository owns a path.
 *
 * A workspace holds a set of repositories — a directory of independently
 * versioned projects has one per child — so a path only means something once it
 * has been attributed to one. Longest match wins, exactly as the server resolves
 * it, so a repository nested inside another answers for its own files.
 *
 * The empty id is the repository at the browser root, or the one containing it;
 * it matches everything nothing deeper claims.
 */
export function repoForPath<T extends { repo: string }>(repos: readonly T[], relPath: string): T | null {
  let best: T | null = null;
  for (const repo of repos) {
    const owns = repo.repo === "" || relPath === repo.repo || relPath.startsWith(`${repo.repo}/`);
    if (owns && (best === null || repo.repo.length > best.repo.length)) best = repo;
  }
  return best;
}
