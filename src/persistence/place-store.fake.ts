import { Place } from "../domain/place.js";
import type { PlaceStore } from "./place-repository.js";

// Keeps place rows in memory, in place of Postgres (DEVELOPMENT.md section 5). It
// matches the way PlaceRepository's queries do. Each read returns a new Place, so a
// filled-in name shows up only once it's saved, as with the database.
export class FakePlaceStore implements PlaceStore {
  readonly rows: { tripId: string; place: Place }[] = [];

  addPlaces(tripId: string, places: readonly Place[]): Promise<Place[]> {
    for (const place of places) {
      if (
        this.#find(
          tripId,
          (row) => row.googlePlaceId === place.googlePlaceId,
        ) === undefined
      ) {
        this.rows.push({ tripId, place: copyOf(place) });
      }
    }
    const stored = places.map((place) =>
      this.#find(tripId, (row) => row.googlePlaceId === place.googlePlaceId),
    );
    return Promise.resolve(
      stored.filter((place) => place !== undefined).map(copyOf),
    );
  }

  loadForTrip(tripId: string): Promise<Place[]> {
    const places = this.rows
      .filter((row) => row.tripId === tripId)
      .map((row) => copyOf(row.place));
    return Promise.resolve(places);
  }

  get(tripId: string, placeId: string): Promise<Place | undefined> {
    const place = this.#find(tripId, (row) => row.id === placeId);
    return Promise.resolve(place === undefined ? undefined : copyOf(place));
  }

  fillNames(places: readonly Place[]): Promise<void> {
    for (const place of places) {
      const row = this.rows.find((stored) => stored.place.id === place.id);
      if (row?.place.name === null && place.name !== null) {
        row.place = copyOf(place);
      }
    }
    return Promise.resolve();
  }

  #find(tripId: string, matches: (place: Place) => boolean): Place | undefined {
    return this.rows.find((row) => row.tripId === tripId && matches(row.place))
      ?.place;
  }
}

function copyOf(place: Place): Place {
  return new Place({
    id: place.id,
    googlePlaceId: place.googlePlaceId,
    name: place.name,
    type: place.type,
    address: place.address,
    latitude: place.latitude,
    longitude: place.longitude,
    rating: place.rating,
    reviewCount: place.reviewCount,
    priceLevel: place.priceLevel,
    openingPeriods: place.openingPeriods,
    weekdayHoursLines: place.weekdayHoursLines,
    summaries: place.summaries,
    links: place.links,
  });
}
