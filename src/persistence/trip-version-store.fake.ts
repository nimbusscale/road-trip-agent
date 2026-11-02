import type {
  TripVersionSource,
  TripVersionStore,
} from "./trip-version-repository.js";

// Keeps what each version was saved from, in place of Postgres (DEVELOPMENT.md section
// 5). The SQL that copies the trip is checked by hand.
export class FakeTripVersionStore implements TripVersionStore {
  readonly saved: TripVersionSource[] = [];

  saveFrom(source: TripVersionSource): Promise<void> {
    this.saved.push(source);
    return Promise.resolve();
  }
}
