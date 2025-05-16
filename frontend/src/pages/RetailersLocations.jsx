import React from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

// Example data
const retailers = [
  { id: 1, name: "Retailer A", lat: 30.0444, lng: 31.2357 },
  { id: 2, name: "Retailer B", lat: 29.9792, lng: 31.1342 },
];

const RetailersLocations = () => {
  return (
    <div style={{ padding: "24px" }}>
      <h1>Retailers Locations</h1>
      <MapContainer center={[30.0444, 31.2357]} zoom={6} style={{ height: "400px", width: "100%" }}>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {retailers.map(r => (
          <Marker key={r.id} position={[r.lat, r.lng]}>
            <Popup>
              {r.name}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};

export default RetailersLocations;
