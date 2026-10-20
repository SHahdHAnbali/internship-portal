// Which Navbar link is active. '/' matches only the home page; other links
// match their path and anything below it, as before. When several links match
// (for example '/mentor' and '/mentor/evaluations'), only the longest one is
// active, so a nested section never highlights its parent link as well.
export function matchesNavigationPath(pathname: string, path: string): boolean {
  return path === '/' ? pathname === '/' : pathname.startsWith(path);
}

export function isNavigationItemActive(pathname: string, path: string, allPaths: readonly string[]): boolean {
  if (!matchesNavigationPath(pathname, path)) return false;
  return !allPaths.some((other) => other.length > path.length && matchesNavigationPath(pathname, other));
}
