// Full-page navigation outside React Router (used by the API client, which
// has no router access). A separate module so tests can replace it.
export function navigateTo(path: string): void {
  if (window.location.pathname !== path) {
    window.location.assign(path);
  }
}
