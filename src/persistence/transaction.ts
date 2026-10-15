import type { Connectable, TransactionClient } from "./queryable.js";

// Runs work in one transaction, on one connection. If the work throws, nothing it did is
// saved, so a refused write leaves the trip as it was (domain model section 1). Writers
// use this. Nothing outside persistence opens a transaction.
export async function inTransaction<T>(
  pool: Connectable,
  work: (client: TransactionClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let isBroken = false;
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The connection itself failed. Drop it, and report the first error.
      isBroken = true;
    }
    throw error;
  } finally {
    client.release(isBroken);
  }
}
