import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Helper: Validate Egypt coordinates
function isValidEgyptCoordinates(lat, lng) {
  const minLat = 22.0, maxLat = 31.9, minLng = 24.7, maxLng = 37.0;
  try {
    lat = parseFloat(lat);
    lng = parseFloat(lng);
    return minLat <= lat && lat <= maxLat && minLng <= lng && lng <= maxLng;
  } catch {
    return false;
  }
}

// Haversine formula for straight-line distance (km)
function haversine(lat1, lon1, lat2, lon2) {
  try {
    lat1 = parseFloat(lat1); lon1 = parseFloat(lon1);
    lat2 = parseFloat(lat2); lon2 = parseFloat(lon2);
    if (isNaN(lat1) || isNaN(lon1) || isNaN(lon2)) return 0;
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon1 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  } catch {
    return 0;
  }
}

// Custom icons
const retailerIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/190/190411.png",
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});
const supplierIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/190/190406.png",
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

const RetailersLocations = () => {
  const [retailers, setRetailers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showRoutes, setShowRoutes] = useState(false);

  // Fetch data from backend API (should serve Google Sheets data)
  useEffect(() => {
    fetch("/api/retailers")
      .then(res => res.json())
      .then(data => {
        console.log('API /api/retailers returned:', data); // DEBUG
        // Filter for valid Egypt coordinates
        const valid = data.filter(r =>
          isValidEgyptCoordinates(r.customer_latitude, r.customer_longitude)
        );
        console.log('Valid Egypt retailers:', valid); // DEBUG
        setRetailers(valid);
      });
  }, []);

  // Map center: average of all valid points, fallback to Cairo
  const avgLat =
    retailers.length > 0
      ? retailers.reduce((sum, r) => sum + parseFloat(r.customer_latitude), 0) /
        retailers.length
      : 30.0444;
  const avgLng =
    retailers.length > 0
      ? retailers.reduce((sum, r) => sum + parseFloat(r.customer_longitude), 0) /
        retailers.length
      : 31.2357;

  return (
    <div style={{ padding: "24px", maxWidth: 1400, margin: "0 auto" }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, color: "#2563eb" }}>
        Retailers Locations
      </h1>
      <div style={{ marginBottom: 16 }}>
        <label>
          <input
            type="checkbox"
            checked={showRoutes}
            onChange={e => setShowRoutes(e.target.checked)}
            style={{ marginRight: 8 }}
          />
          Show supplier routes
        </label>
      </div>
      <MapContainer
        center={[avgLat, avgLng]}
        zoom={6}
        style={{ height: "500px", width: "100%", borderRadius: 12, boxShadow: "0 2px 8px #0001" }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {retailers.map(r => (
          <Marker
            key={r.order_id || r.id}
            position={[parseFloat(r.customer_latitude), parseFloat(r.customer_longitude)]}
            icon={retailerIcon}
            eventHandlers={{
              click: () => setSelected(r),
            }}
          >
            <Tooltip>{r.retailer_name}</Tooltip>
          </Marker>
        ))}
        {showRoutes &&
          selected &&
          selected.supplier_latitude &&
          selected.supplier_longitude && (
            <>
              <Marker
                position={[
                  parseFloat(selected.supplier_latitude),
                  parseFloat(selected.supplier_longitude),
                ]}
                icon={supplierIcon}
              >
                <Tooltip>Supplier: {selected.supplier_name}</Tooltip>
              </Marker>
              <Polyline
                positions={[
                  [
                    parseFloat(selected.supplier_latitude),
                    parseFloat(selected.supplier_longitude),
                  ],
                  [
                    parseFloat(selected.customer_latitude),
                    parseFloat(selected.customer_longitude),
                  ],
                ]}
                color="#22c55e"
                weight={4}
                opacity={0.7}
                dashArray="10,10"
              />
            </>
          )}
      </MapContainer>
      <div style={{ marginTop: 24 }}>
        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            padding: "2rem",
            boxShadow: "0 2px 8px #0001",
            maxWidth: 600,
            margin: "24px auto",
          }}
        >
          {selected ? (
            <>
              <h2 style={{ color: "#2563eb" }}>{selected.retailer_name}</h2>
              <div>
                <b>Area:</b> {selected.customer_area} <br />
                <b>Supplier:</b> {selected.supplier_name} <br />
                <b>Order ID:</b> {selected.order_id} <br />
                <b>Created At:</b> {selected.created_at} <br />
                <b>Delivery Date:</b> {selected.delivery_date} <br />
                <b>Customer Lat/Lng:</b> {selected.customer_latitude}, {selected.customer_longitude}
                <br />
                {selected.supplier_latitude && selected.supplier_longitude && (
                  <>
                    <b>Supplier Lat/Lng:</b> {selected.supplier_latitude},{" "}
                    {selected.supplier_longitude}
                    <br />
                    <b>Straight-line distance:</b>{" "}
                    {haversine(
                      selected.customer_latitude,
                      selected.customer_longitude,
                      selected.supplier_latitude,
                      selected.supplier_longitude
                    ).toFixed(2)}{" "}
                    km
                  </>
                )}
              </div>
              <button
                style={{
                  marginTop: 16,
                  background: "#2563eb",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "10px 24px",
                  fontWeight: 600,
                  fontSize: 16,
                  cursor: "pointer",
                }}
                onClick={() => setSelected(null)}
              >
                Clear Selection
              </button>
            </>
          ) : (
            <div style={{ color: "#64748b" }}>
              Click a retailer pin to view details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RetailersLocations;
