export interface SessionProperties {
  id: string;
  tripId: string;
  createdDateTime: Date;
  title: string;
  agentSessionId: string;
}

// One conversation with the agent about a trip (persistence design, section 8.5). It
// isn't part of the trip, so it isn't in the domain model. Nothing about it changes once
// it's created, so every property is read only.
export class Session {
  readonly id: string;
  readonly tripId: string;
  readonly createdDateTime: Date;
  // A few words from the user's first message, for the trip's session list.
  readonly title: string;
  // The Agent SDK's ID for the conversation, a UUID the app chooses (section 6).
  readonly agentSessionId: string;

  constructor(properties: SessionProperties) {
    this.id = properties.id;
    this.tripId = properties.tripId;
    this.createdDateTime = properties.createdDateTime;
    this.title = properties.title;
    this.agentSessionId = properties.agentSessionId;
  }
}
