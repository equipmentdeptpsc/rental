export function assertSafePostgresTestReset(connectionString: string, allowReset: boolean): void {
  if (!allowReset) throw new Error("PostgreSQL test cleanup requires explicit reset opt-in.");
  let url: URL;
  try { url = new URL(connectionString); }
  catch { throw new Error("DEUR_SYNC_POSTGRES_TEST_URL must be a valid PostgreSQL test URL."); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error("DEUR_SYNC_POSTGRES_TEST_URL must be a valid PostgreSQL test URL.");
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, "")).toLowerCase();
  if (!database || !database.includes("test") || ["postgres", "template0", "template1"].includes(database)) {
    throw new Error("PostgreSQL cleanup is allowed only for a clearly dedicated test database.");
  }
}
