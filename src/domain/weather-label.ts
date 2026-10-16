// Domain model section 2.
export const WEATHER_LABELS = ["forecast", "seasonalAverages"] as const;

export type WeatherLabel = (typeof WEATHER_LABELS)[number];
