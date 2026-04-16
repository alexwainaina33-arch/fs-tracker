export function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isInsideZone(lat, lng, zone) {
  return haversineDistance(lat, lng, zone.center_lat, zone.center_lng) <= zone.radius_metres;
}

export function checkGeofences(lat, lng, zones, prevState = {}) {
  const inside   = {};
  const breaches = [];
  for (const zone of zones) {
    const nowInside = isInsideZone(lat, lng, zone);
    const wasInside = prevState[zone.id] ?? true;
    inside[zone.id] = nowInside;
    if (wasInside && !nowInside && zone.alert_on_exit)  breaches.push({ zone, type: "exit" });
    if (!wasInside && nowInside && zone.alert_on_enter) breaches.push({ zone, type: "enter" });
  }
  return { inside, breaches };
}
