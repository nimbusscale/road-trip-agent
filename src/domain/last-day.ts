// The trip's last day, which ends at the end place with no night (domain model 3.6).
// For now it holds only its ID. Phase 16 adds the rest of a day.
export class LastDay {
  readonly id: string;

  constructor(id: string) {
    this.id = id;
  }
}
