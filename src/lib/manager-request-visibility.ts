export function filterManagerRequests<T extends { id: string }>(
  requests: T[],
  hiddenIds: ReadonlySet<string>,
  showHidden = false,
): T[] {
  return requests.filter((request) => hiddenIds.has(request.id) === showHidden);
}