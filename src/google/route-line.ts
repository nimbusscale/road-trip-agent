// Google's encoded route line, decoded into its points, in route order. The format is
// Google's "encoded polyline": each latitude and longitude is the change from the point
// before, in hundred-thousandths of a degree, written five bits to a character.

export interface LinePoint {
  latitude: number;
  longitude: number;
}

const CHARACTER_OFFSET = 63;
const CHUNK_BITS = 5;
const CHUNK_MASK = 0x1f;
const MORE_CHUNKS = 0x20;
const PRECISION = 1e5;

export function decodeRouteLine(line: string): LinePoint[] {
  const points: LinePoint[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;
  while (index < line.length) {
    const latitudeChange = readValue(line, index);
    const longitudeChange = readValue(line, latitudeChange.next);
    index = longitudeChange.next;
    latitude += latitudeChange.value;
    longitude += longitudeChange.value;
    points.push({
      latitude: latitude / PRECISION,
      longitude: longitude / PRECISION,
    });
  }
  return points;
}

// One signed value, and where the next one starts.
function readValue(
  line: string,
  start: number,
): { value: number; next: number } {
  let result = 0;
  let shift = 0;
  let index = start;
  let chunk = MORE_CHUNKS;
  while (chunk >= MORE_CHUNKS) {
    if (index >= line.length) {
      throw new RangeError("The route line ends partway through a point.");
    }
    chunk = line.charCodeAt(index) - CHARACTER_OFFSET;
    index += 1;
    result += (chunk & CHUNK_MASK) * 2 ** shift;
    shift += CHUNK_BITS;
  }
  // The lowest bit says whether the value is negative.
  const value = result % 2 === 1 ? -(result - 1) / 2 - 1 : result / 2;
  return { value, next: index };
}
