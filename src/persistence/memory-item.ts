import { RuleError } from "../domain/rule-error.js";

export interface MemoryItemProperties {
  id: string;
  userId: string;
  tripId: string | null;
  text: string;
  createdDateTime: Date;
}

// One plain-text note in user memory, or in one trip's memory (persistence design,
// section 8.8). The maximum length is a setting, so MemoryWriter checks it, not this
// class (DEVELOPMENT.md section 8).
export class MemoryItem {
  readonly id: string;
  readonly userId: string;
  // Empty for a user memory item.
  readonly tripId: string | null;
  readonly createdDateTime: Date;
  #text = "";

  constructor(properties: MemoryItemProperties) {
    this.id = properties.id;
    this.userId = properties.userId;
    this.tripId = properties.tripId;
    this.createdDateTime = properties.createdDateTime;
    this.text = properties.text;
  }

  get text(): string {
    return this.#text;
  }

  set text(value: string) {
    if (value.trim() === "") {
      throw new RuleError("A memory item's text can't be empty.");
    }
    this.#text = value;
  }
}
