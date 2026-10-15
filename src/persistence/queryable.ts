// The part of a pg pool or client that the repositories use. A repository is created
// for one of these: the pool for a read, or a transaction's client for a write
// (persistence design, section 8.7). Tests pass fakes.
//
// Rows come back as unknown, so each repository has to parse them with Zod
// (DEVELOPMENT.md section 4).
export interface Queryable {
  query(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: readonly unknown[] }>;
}

export interface TransactionClient extends Queryable {
  // True drops the connection instead of returning it to the pool.
  release(destroy?: boolean): void;
}

export interface Connectable {
  connect(): Promise<TransactionClient>;
}
