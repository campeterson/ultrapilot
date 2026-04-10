// Netlify Function: metar
// Proxies aviationweather.gov to fetch live METAR data.
//
// Usage:
//   GET /.netlify/functions/metar?id=KSLC       → METAR for that ICAO identifier
//   GET /.netlify/functions/metar?lat=40.0&lon=-111.0 → METAR for nearest station

const BASE_URL = "https://aviationweather.gov/api/data";
const BBOX_RADIUS_MILES = 75;
const EARTH_RADIUS_MILES = 3958.8;

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  const params = event.queryStringParameters || {};
  const { id, lat, lon } = params;

  try {
    if (id) {
      const metar = await fetchMetar(id.trim().toUpperCase());
      if (!metar) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: `No current METAR found for ${id.toUpperCase()}` }),
        };
      }
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ metar, station: id.trim().toUpperCase() }),
      };
    }

    if (lat && lon) {
      const station = await nearestMetarStation(parseFloat(lat), parseFloat(lon));
      if (!station) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: "No METAR stations found within 75 miles" }),
        };
      }
      const metar = await fetchMetar(station.id);
      if (!metar) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: `No current METAR available for ${station.id}` }),
        };
      }
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          metar,
          station: station.id,
          distance_miles: Math.round(station.distance_miles * 10) / 10,
        }),
      };
    }

    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Provide ?id=KSLC or ?lat=40.0&lon=-111.0" }),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: "Weather service unavailable. Try again." }),
    };
  }
};

async function fetchMetar(id) {
  const url = `${BASE_URL}/metar?ids=${encodeURIComponent(id)}&format=raw&hours=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`aviationweather.gov metar returned ${res.status}`);
  const text = (await res.text()).trim();
  // The API returns one METAR per line (newest first). Take only the first.
  const first = text.split("\n").map((l) => l.trim()).find((l) => l.length > 0);
  return first || null;
}

async function nearestMetarStation(lat, lon) {
  const latDelta = BBOX_RADIUS_MILES / 69.0;
  const lonDelta = BBOX_RADIUS_MILES / (69.0 * Math.cos((lat * Math.PI) / 180));
  const bbox = [
    (lat - latDelta).toFixed(4),
    (lon - lonDelta).toFixed(4),
    (lat + latDelta).toFixed(4),
    (lon + lonDelta).toFixed(4),
  ].join(",");

  const url = `${BASE_URL}/stationinfo?bbox=${bbox}&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`stationinfo returned ${res.status}`);
  const stations = await res.json();

  const metar = (Array.isArray(stations) ? stations : [])
    .filter((s) => Array.isArray(s.siteType) && s.siteType.includes("METAR"))
    .map((s) => ({ ...s, distance_miles: haversine(lat, lon, s.lat, s.lon) }))
    .sort((a, b) => a.distance_miles - b.distance_miles);

  return metar[0] || null;
}

function haversine(lat1, lon1, lat2, lon2) {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(a));
}
