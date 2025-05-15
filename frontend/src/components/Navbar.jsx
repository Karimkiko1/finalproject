import React from 'react';
import { Link } from "react-router-dom";

const handleAutoCommit = async () => {
  try {
    await fetch('/api/auto-commit', { method: 'POST' });
    alert('Auto-commit triggered!');
  } catch (e) {
    alert('Failed to trigger auto-commit.');
  }
};

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
    <button onClick={handleAutoCommit} style={{ marginLeft: 'auto', padding: '8px 18px', borderRadius: 7, fontWeight: 600, fontSize: 15, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}>
      Auto Commit
    </button>
  </nav>
);

export default Navbar;
