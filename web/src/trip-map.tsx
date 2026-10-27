// web/tsconfig.json loads only Vite's global types, so the map's global `google.maps`
// types are named here.
/// <reference types="google.maps" />
import {
  APIProvider,
  InfoWindow,
  Map,
  Marker,
  Polyline,
  useMap,
} from "@vis.gl/react-google-maps";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ItineraryResponse } from "../../src/shared/itinerary.schema";
import {
  type MapMarker,
  mapMarkers,
  mapPositions,
  type MarkerKind,
  type Position,
  routeLines,
} from "./map-items";
import { webEnv } from "./web-env";

const MARKER_COLORS: Record<MarkerKind, string> = {
  stay: "#9334e6",
  attraction: "#188038",
  restaurant: "#e8710a",
};

const LEGEND: [MarkerKind, string][] = [
  ["stay", "Stays"],
  ["attraction", "Attractions"],
  ["restaurant", "Restaurants"],
];

const ROUTE_COLOR = "#1a73e8";

// The whole United States, until the trip has a place to show.
const START_CENTER = { lat: 39.8, lng: -98.6 };
const START_ZOOM = 3;
// How close the map zooms to a trip with only one place.
const ONE_PLACE_ZOOM = 12;

// One Google map of the whole trip: each leg's route line, and a marker for each stay,
// attraction, and restaurant. A click on a marker shows its details (functional spec
// 9.2, Google design section 4).
export function TripMap({ view }: { view: ItineraryResponse }) {
  const markers = useMemo(() => mapMarkers(view), [view]);
  const lines = useMemo(() => routeLines(view), [view]);
  const positions = useMemo(() => mapPositions(view), [view]);
  const [openKey, setOpenKey] = useState<string | null>(null);
  // Null once the marker is gone, such as after the coordinator removed its stop.
  const open = markers.find((marker) => marker.key === openKey) ?? null;
  return (
    <APIProvider apiKey={webEnv.googleMapsBrowserKey}>
      <Map
        className="trip-map"
        defaultCenter={START_CENTER}
        defaultZoom={START_ZOOM}
        // The map sits in the itinerary, which scrolls, so the wheel zooms only with
        // Ctrl held.
        gestureHandling="cooperative"
        // Google's own places would open Google's details, not the trip's.
        clickableIcons={false}
        mapTypeControl={false}
        streetViewControl={false}
      >
        {lines.map((line) => (
          <Polyline
            key={line.key}
            encodedPath={line.encodedPath}
            strokeColor={ROUTE_COLOR}
            strokeOpacity={0.8}
            strokeWeight={4}
          />
        ))}
        {markers.map((marker) => (
          <TripMarker
            key={marker.key}
            marker={marker}
            onClick={() => {
              setOpenKey(marker.key);
            }}
          />
        ))}
        {open === null ? null : (
          <MarkerDetails
            marker={open}
            onClose={() => {
              setOpenKey(null);
            }}
          />
        )}
        <FitToTrip positions={positions} />
      </Map>
      <Legend />
    </APIProvider>
  );
}

function TripMarker({
  marker,
  onClick,
}: {
  marker: MapMarker;
  onClick: () => void;
}) {
  return (
    <Marker
      position={latLng(marker.place)}
      title={marker.heading}
      icon={{
        path: google.maps.SymbolPath.CIRCLE,
        scale: 9,
        fillColor: MARKER_COLORS[marker.kind],
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2,
      }}
      onClick={onClick}
    />
  );
}

// Over the marker, with why the place was picked and where its facts came from.
function MarkerDetails({
  marker,
  onClose,
}: {
  marker: MapMarker;
  onClose: () => void;
}) {
  const { selection } = marker;
  return (
    <InfoWindow
      position={latLng(marker.place)}
      pixelOffset={[0, -9]}
      headerContent={<strong>{marker.heading}</strong>}
      onCloseClick={onClose}
    >
      <div className="marker-details">
        {marker.details.map((line) => (
          <p key={line}>{line}</p>
        ))}
        {selection === null ? null : (
          <>
            <p>{selection.rationale}</p>
            {selection.namedByUser || selection.sourceLink === null ? (
              <p>You named this place.</p>
            ) : (
              <p>
                <a href={selection.sourceLink} target="_blank" rel="noreferrer">
                  Source
                </a>
              </p>
            )}
          </>
        )}
      </div>
    </InfoWindow>
  );
}

// Zooms to the trip's places when they change, such as after a turn adds a stay. Not
// on every read, so a map the user moved stays put while the plan is the same.
function FitToTrip({ positions }: { positions: Position[] }) {
  const map = useMap();
  const fittedKeyRef = useRef<string | null>(null);
  const key = positions
    .map((each) => `${String(each.latitude)},${String(each.longitude)}`)
    .join(";");

  useEffect(() => {
    if (
      map === null ||
      positions.length === 0 ||
      fittedKeyRef.current === key
    ) {
      return;
    }
    fittedKeyRef.current = key;
    const bounds = new google.maps.LatLngBounds();
    for (const position of positions) {
      bounds.extend(latLng(position));
    }
    if (bounds.getNorthEast().equals(bounds.getSouthWest())) {
      map.setCenter(bounds.getCenter());
      map.setZoom(ONE_PLACE_ZOOM);
    } else {
      map.fitBounds(bounds, 32);
    }
  }, [map, positions, key]);

  return null;
}

function Legend() {
  return (
    <p className="map-legend">
      {LEGEND.map(([kind, label]) => (
        <span key={kind}>
          <span className="dot" style={{ background: MARKER_COLORS[kind] }} />
          {label}
        </span>
      ))}
    </p>
  );
}

function latLng(position: Position): google.maps.LatLngLiteral {
  return { lat: position.latitude, lng: position.longitude };
}
