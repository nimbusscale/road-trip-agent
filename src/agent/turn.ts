import type { TurnEvent } from "./turn-event.js";

// One running turn's events. The turn adds them as they come, whether or not anything
// reads them, so a closed browser tab doesn't stop it (systems design section 4). A
// reader gets every event from the start, then each new one, until the turn ends.
export class Turn {
  readonly #events: TurnEvent[] = [];
  #ended = false;
  // Resolved, and replaced, on each change, to wake the readers.
  #changed = Promise.withResolvers<undefined>();

  add(event: TurnEvent): void {
    this.#events.push(event);
    this.#wakeReaders();
  }

  end(): void {
    this.#ended = true;
    this.#wakeReaders();
  }

  async *events(): AsyncGenerator<TurnEvent> {
    let next = 0;
    for (;;) {
      const changed = this.#changed.promise;
      for (const event of this.#events.slice(next)) {
        next++;
        yield event;
      }
      if (this.#ended && next === this.#events.length) {
        return;
      }
      await changed;
    }
  }

  #wakeReaders(): void {
    this.#changed.resolve(undefined);
    this.#changed = Promise.withResolvers<undefined>();
  }
}
