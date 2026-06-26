/** Great-circle distance in km between two [lat, lng] pairs. */
export function haversineKm(
  [lat1, lng1]: [number, number],
  [lat2, lng2]: [number, number],
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const COUNTRY_NAME: Record<string, string> = {
  VE: 'Venezuela', US: 'EE.UU.', ES: 'España',
  CO: 'Colombia', MX: 'México', AR: 'Argentina',
  CL: 'Chile', PE: 'Perú', EC: 'Ecuador', PA: 'Panamá', CA: 'Canadá',
};
