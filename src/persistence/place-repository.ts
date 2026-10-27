import type { OpeningPeriod } from "../domain/opening-period.js";
import { Place } from "../domain/place.js";
import { placeRowSchema } from "./place-row.schema.js";
import type { Queryable } from "./queryable.js";

// Reads and saves place rows (persistence design, section 8.7). Every query names the
// trip, since a trip links only to its own places (domain model 3.10).
export interface PlaceStore {
  // Adds each place the trip doesn't have yet, matched by Google place ID. Returns the
  // stored places in the order given, so a place the trip already had comes back as
  // stored, with its own ID and facts.
  addPlaces(tripId: string, places: readonly Place[]): Promise<Place[]>;
  loadForTrip(tripId: string): Promise<Place[]>;
  // Undefined when the trip has no place with this ID.
  get(tripId: string, placeId: string): Promise<Place | undefined>;
  // Sets each place's name on its row, only where the row has none.
  fillNames(places: readonly Place[]): Promise<void>;
}

export const PLACE_COLUMNS = [
  "id",
  "trip_id",
  "google_place_id",
  "name",
  "type",
  "address",
  "latitude",
  "longitude",
  "rating",
  "review_count",
  "price_level",
  "opening_periods",
  "weekday_hours_lines",
  "summaries",
  "links",
] as const;

const SELECT_PLACES = `SELECT ${PLACE_COLUMNS.join(", ")} FROM places`;

export class PlaceRepository implements PlaceStore {
  constructor(private readonly connection: Queryable) {}

  async addPlaces(tripId: string, places: readonly Place[]): Promise<Place[]> {
    if (places.length === 0) {
      return [];
    }
    // A place the trip already has keeps its row, and the new facts are dropped
    // (domain model 3.10). The rows go in by Google place ID, so two saves of the same
    // new places wait for each other in the same order, and can't deadlock
    // (persistence design, section 4).
    const inInsertOrder = [...places].sort(byGooglePlaceId);
    await this.connection.query(
      `INSERT INTO places (${PLACE_COLUMNS.join(", ")})
       VALUES ${[...inInsertOrder.keys()].map(placeholdersOf).join(", ")}
       ON CONFLICT (trip_id, google_place_id) DO NOTHING`,
      inInsertOrder.flatMap((place) => valuesOf(tripId, place)),
    );
    const { rows } = await this.connection.query(
      `${SELECT_PLACES} WHERE trip_id = $1 AND google_place_id = ANY($2)`,
      [tripId, places.map((place) => place.googlePlaceId)],
    );
    return inGivenOrder(rows.map(toPlace), places);
  }

  async loadForTrip(tripId: string): Promise<Place[]> {
    const { rows } = await this.connection.query(
      `${SELECT_PLACES} WHERE trip_id = $1`,
      [tripId],
    );
    return rows.map(toPlace);
  }

  async get(tripId: string, placeId: string): Promise<Place | undefined> {
    const { rows } = await this.connection.query(
      `${SELECT_PLACES} WHERE id = $1 AND trip_id = $2`,
      [placeId, tripId],
    );
    return rows.length === 0 ? undefined : toPlace(rows[0]);
  }

  async fillNames(places: readonly Place[]): Promise<void> {
    for (const place of places) {
      await this.connection.query(
        "UPDATE places SET name = $2 WHERE id = $1 AND name IS NULL",
        [place.id, place.name],
      );
    }
  }
}

// Compares the IDs as plain strings, so every copy of the app sorts them the same way,
// whatever its locale.
function byGooglePlaceId(one: Place, other: Place): number {
  if (one.googlePlaceId === other.googlePlaceId) {
    return 0;
  }
  return one.googlePlaceId < other.googlePlaceId ? -1 : 1;
}

function toPlace(row: unknown): Place {
  return new Place(placeRowSchema.parse(row));
}

// The placeholders for the place at this index, such as ($16, $17, ..., $30).
function placeholdersOf(index: number): string {
  const numbers = [...PLACE_COLUMNS.keys()].map(
    (column) => `$${String(index * PLACE_COLUMNS.length + column + 1)}`,
  );
  return `(${numbers.join(", ")})`;
}

// In the order of PLACE_COLUMNS.
function valuesOf(tripId: string, place: Place): unknown[] {
  return [
    place.id,
    tripId,
    place.googlePlaceId,
    place.name,
    place.type,
    place.address,
    place.latitude,
    place.longitude,
    place.rating,
    place.reviewCount,
    place.priceLevel,
    JSON.stringify(place.openingPeriods.map(storedOpeningPeriod)),
    place.weekdayHoursLines,
    place.summaries,
    place.links,
  ];
}

// Each time of day is text, as in the opening_periods column.
function storedOpeningPeriod(period: OpeningPeriod): object {
  return {
    openDay: period.openDay,
    openTime: period.openTime.toText(),
    closeDay: period.closeDay,
    closeTime: period.closeTime?.toText() ?? null,
  };
}

function inGivenOrder(
  stored: readonly Place[],
  given: readonly Place[],
): Place[] {
  return given.map((place) => {
    const match = stored.find(
      (candidate) => candidate.googlePlaceId === place.googlePlaceId,
    );
    if (match === undefined) {
      throw new Error(
        `The place ${place.googlePlaceId} wasn't stored, and isn't in the trip.`,
      );
    }
    return match;
  });
}
