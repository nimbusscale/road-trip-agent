// The credits the data's terms ask for, each in its own small piece so every place that
// shows the data gives the same text. The text is never changed, and stays visible.

// For text made from Google's data, such as the weather worker's reading of a forecast
// (Google design section 3).
export function GoogleMapsCredit() {
  return (
    <p className="credit" translate="no">
      Includes data from Google Maps
    </p>
  );
}

// Wherever seasonal averages appear (Open-Meteo design section 4).
export function OpenMeteoCredit() {
  return (
    <p className="credit">
      <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
        Weather data by Open-Meteo.com
      </a>
    </p>
  );
}
