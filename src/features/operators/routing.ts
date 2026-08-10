export function operatorEditHref(operatorId: string): string {
  return `/operators/edit/${encodeURIComponent(operatorId)}`;
}
