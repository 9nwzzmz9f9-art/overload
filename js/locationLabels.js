// Display-only names for locations (user feedback: "add an option to
// customize the names of the workout locations"). The underlying ids —
// "home", "beach", "florida", and the special "other" — never change;
// only what's shown to the user does. Every screen that displays a
// location fetches labels once and looks names up through here.

import { repository } from "./repository.js";

export async function getLocationLabels() {
  const settings = await repository.getAppSettings();
  return settings.locationNames ?? {};
}

/** "other" is never customizable — it's a fixed pseudo-location, not a real one. */
export function labelFor(labels, locationId) {
  if (locationId === "other") return "Other";
  return labels[locationId] ?? capitalize(locationId);
}

function capitalize(s) {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
