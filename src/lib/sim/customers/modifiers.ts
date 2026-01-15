import type { WeatherModifier } from "./types";

/**
 * Weather modifiers for demand and quality perception
 *
 * | Weather | Demand | Quality Importance |
 * |---------|--------|-------------------|
 * | sunny   | 1.2    | 1.0               |
 * | hot     | 1.4    | 1.2 (cold drinks valued more) |
 * | cloudy  | 0.9    | 1.0               |
 * | rainy   | 0.6    | 0.8               |
 * | cold    | 0.5    | 0.7               |
 */
const WEATHER_MODIFIERS: Record<string, WeatherModifier> = {
  sunny: { demandMultiplier: 1.2, qualityImportance: 1.0 },
  hot: { demandMultiplier: 1.4, qualityImportance: 1.2 },
  cloudy: { demandMultiplier: 0.9, qualityImportance: 1.0 },
  rainy: { demandMultiplier: 0.6, qualityImportance: 0.8 },
  cold: { demandMultiplier: 0.5, qualityImportance: 0.7 },
};

const DEFAULT_WEATHER_MODIFIER: WeatherModifier = {
  demandMultiplier: 1.0,
  qualityImportance: 1.0,
};

/**
 * Get weather modifier for demand and quality calculations
 */
export function getWeatherModifier(weather: string): WeatherModifier {
  return WEATHER_MODIFIERS[weather] ?? DEFAULT_WEATHER_MODIFIER;
}

/**
 * Special event modifiers for demand
 *
 * | Event          | Modifier |
 * |----------------|----------|
 * | parade         | 1.5      |
 * | festival       | 1.8      |
 * | farmers_market | 1.3      |
 * | sports_game    | 1.6      |
 * | concert        | 1.7      |
 */
const SPECIAL_EVENT_MODIFIERS: Record<string, number> = {
  parade: 1.5,
  festival: 1.8,
  farmers_market: 1.3,
  sports_game: 1.6,
  concert: 1.7,
};

/**
 * Get special event modifier for demand
 * Returns 1.0 if no event or unknown event
 */
export function getSpecialEventModifier(event?: string): number {
  if (!event) return 1.0;
  return SPECIAL_EVENT_MODIFIERS[event] ?? 1.0;
}
