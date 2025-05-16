import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from "react-router-dom";
import Navbar from './components/Navbar.jsx';
import Dashboard from './pages/Dashboard.jsx';
import DriversLocations from './pages/DriversLocations.jsx';
import RetailersLocations from './pages/RetailersLocations.jsx';
import CBMCalculator from './pages/CBMCalculator.jsx';
import TripAssignment from './pages/TripAssignment.jsx';
import SupplierTripAssignment from './pages/SupplierTripAssignment.jsx';
function App() {
  const navLinks = [
    { to: "/cbm", label: "Weights & Dimensions" },
    { to: "/drivers", label: "Drivers Locations" },
    { to: "/RetailersLocations", label: "Retailers Locations" },
    { to: "/trips", label: "Trip Assignment" },
    { to: "/supplier-trip-assignment", label: "Supplier Trip Assignment" },
  ];

  const navColor = "#f59e42";

  return (
    <Router>
      {/* Professional Navigation Bar */}
      <nav
        style={{
          display: "flex",
          gap: 16,
          padding: "18px 32px",
          background: "#f8fafc",
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          alignItems: "center",
        }}
      >
        {navLinks.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            style={{
              fontWeight: 500,
              color: "#374151",
              background: "#f3f4f6",
              textDecoration: "none",
              padding: "10px 18px",
              borderRadius: 6,
              transition: "background 0.2s, color 0.2s, transform 0.1s",
              fontSize: 16,
              letterSpacing: 0.2,
              border: "1px solid #e5e7eb",
              outline: "none",
              cursor: "pointer",
              display: "inline-block",
            }}
            onMouseOver={e => {
              e.target.style.background = "#f59e42";
              e.target.style.color = "#fff";
              e.target.style.transform = "translateY(-1px) scale(1.02)";
            }}
            onMouseOut={e => {
              e.target.style.background = "#f3f4f6";
              e.target.style.color = "#374151";
              e.target.style.transform = "none";
            }}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <Routes>
        <Route path="/drivers" element={<DriversLocations />} />
        <Route path="/RetailersLocations" element={<RetailersLocations />} />
        <Route path="/cbm" element={<CBMCalculator />} />
        <Route path="/trips" element={<TripAssignment />} />
        <Route path="/supplier-trip-assignment" element={<SupplierTripAssignment />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
