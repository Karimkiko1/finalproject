import React from "react";

// --- Utility Functions (JS/React translation of your Python functions) ---

// Save dashboard settings to localStorage (simulate file save)
export function saveDashboardSettings(dashboardLayout, dashboardColumnMapping) {
  try {
    const layout = dashboardLayout
      ? dashboardLayout.map(item =>
          typeof item === "object"
            ? { i: item.i, x: item.x, y: item.y, w: item.w, h: item.h }
            : item
        )
      : null;
    const settings = {
      dashboard_layout: layout,
      dashboard_column_mapping: dashboardColumnMapping,
    };
    localStorage.setItem("dashboard_settings", JSON.stringify(settings));
    // eslint-disable-next-line no-console
    console.log("Dashboard settings saved to localStorage");
    return true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("Error saving dashboard settings:", e);
    return false;
  }
}

// Load ORS API key from config (simulate config file)
export function loadORSConfig() {
  try {
    const config = localStorage.getItem("ors_config");
    if (config) {
      return JSON.parse(config).api_key || "YOUR_ORS_API_KEY";
    }
    // eslint-disable-next-line no-console
    console.warn("ORS config not found in localStorage.");
    return "YOUR_ORS_API_KEY";
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("Error loading ORS config:", e);
    return "YOUR_ORS_API_KEY";
  }
}

// Simulate OpenRouteService client (replace with real API call in production)
export async function getRoute(startCoords, endCoords, apiKey = "YOUR_ORS_API_KEY") {
  // startCoords, endCoords: [lng, lat]
  try {
    // You must implement a backend proxy for ORS or use fetch directly if CORS is allowed
    // Example endpoint: https://api.openrouteservice.org/v2/directions/driving-car
    // This is a stub for frontend-only usage
    return null;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("Error getting route:", e);
    return null;
  }
}

// Validate if coordinates are within Egypt's boundaries
export function isValidEgyptCoordinates(lat, lng) {
  const EGYPT_BOUNDS = {
    min_lat: 22.0,
    max_lat: 31.9,
    min_lng: 24.7,
    max_lng: 37.0,
  };
  try {
    lat = parseFloat(lat);
    lng = parseFloat(lng);
    return (
      EGYPT_BOUNDS.min_lat <= lat &&
      lat <= EGYPT_BOUNDS.max_lat &&
      EGYPT_BOUNDS.min_lng <= lng &&
      lng <= EGYPT_BOUNDS.max_lng
    );
  } catch {
    return false;
  }
}

// Validate coordinates in an array of objects
export function validateCoordinates(data, latKey, lngKey) {
  const valid = data.filter(row => isValidEgyptCoordinates(row[latKey], row[lngKey]));
  const invalidCount = data.length - valid.length;
  if (invalidCount > 0) {
    // eslint-disable-next-line no-console
    console.warn(`Found ${invalidCount} invalid coordinates that will be filtered out.`);
  }
  return valid;
}

// List all sheets (stub, replace with backend call)
export async function listAllSheets() {
  // You must implement this with your backend or Google Sheets API
  // Return an array of sheet names
  return [];
}

// Haversine formula for distance in km
export function haversine(lat1, lon1, lat2, lon2) {
  try {
    lat1 = parseFloat(lat1) || 0;
    lon1 = parseFloat(lon1) || 0;
    lat2 = parseFloat(lat2) || 0;
    lon2 = parseFloat(lon2) || 0;
    if ((lat1 === 0 && lon1 === 0) || (lat2 === 0 && lon2 === 0)) return 0;
    const toRad = deg => (deg * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.asin(Math.sqrt(a));
    return R * c;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("Error calculating distance:", e);
    return 0;
  }
}

// --- End of utility functions ---

const RetailersLocations = () => {
  return (
    <div style={{ padding: "24px" }}>
      <h1>Retailers Locations</h1>
      <p>
        This page will display retailer locations, supplier info, and delivery routes on a map.
      </p>
      {/* TODO: Add map, retailer selection, and route details here */}
    </div>
  );
};

export default RetailersLocations;

// To add this page next to the "Trip Assignment" tab, 
// ensure your main navigation (e.g., in App.js or your sidebar/tabs component) includes both:
//   - Trip Assignment
//   - Retailers Locations
// Example (pseudo-code):
// <Tabs>
//   <Tab label="Trip Assignment" ... />
//   <Tab label="Retailers Locations" ... />
//   ...
// </Tabs>
