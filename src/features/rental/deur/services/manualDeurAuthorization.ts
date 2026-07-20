/** Current MVP Admin is the Equipment Department Admin; Customer Site Admin is a future distinct role. */
export function canCreateManualDeur(actor: { role?: unknown }): boolean {
  return actor.role === "Admin";
}
