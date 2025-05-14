import React from 'react';
import { Link } from "react-router-dom";

const Navbar = () => (
  <nav style={{
    display: "flex",
    gap: 24,
    padding: 24,
    background: "#f8fafc",
    borderBottom: "1px solid #e5e7eb"
  }}>
    <Link to="/" style={{ fontWeight: 600, color: "#2563eb", textDecoration: "none" }}>Dashboard</Link>
    <Link to="/trips" style={{ fontWeight: 600, color: "#2563eb", textDecoration: "none" }}>Trip Assignment</Link>
    <Link to="/SupplierTripAssignment" style={{ fontWeight: 600, color: "#be123c", textDecoration: "none" }}>Supplier Trip Assignment</Link>
    <Link to="/cbm" style={{ fontWeight: 600, color: "#0ea5e9", textDecoration: "none" }}>CBM Calculations</Link>
    <Link to="/RetailersLocations" style={{ fontWeight: 600, color: "#22c55e", textDecoration: "none" }}>Retailers Locations</Link>
  </nav>
);

export default Navbar;
