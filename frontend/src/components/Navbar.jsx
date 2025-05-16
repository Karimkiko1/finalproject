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
    <Link to="/" style={{
      fontWeight: 500,
      textDecoration: "none",
      padding: "10px 18px",
      borderRadius: 6,
      transition: "background 0.2s, color 0.2s, border 0.2s",
      fontSize: 16,
      letterSpacing: 0.2,
      border: "1px solid #2563eb",
      outline: "none",
      cursor: "pointer",
      display: "inline-block",
      color: "#2563eb",
      background: "#fff",
      marginRight: 8
    }}>Dashboard</Link>
    <Link to="/cbm" style={{
      fontWeight: 500,
      textDecoration: "none",
      padding: "10px 18px",
      borderRadius: 6,
      transition: "background 0.2s, color 0.2s, border 0.2s",
      fontSize: 16,
      letterSpacing: 0.2,
      border: "1px solid #2563eb",
      outline: "none",
      cursor: "pointer",
      display: "inline-block",
      color: "#2563eb",
      background: "#fff",
      marginRight: 8
    }}>Weights & Dimensions</Link>
    <Link to="/trips" style={{
      fontWeight: 500,
      textDecoration: "none",
      padding: "10px 18px",
      borderRadius: 6,
      transition: "background 0.2s, color 0.2s, border 0.2s",
      fontSize: 16,
      letterSpacing: 0.2,
      border: "1px solid #2563eb",
      outline: "none",
      cursor: "pointer",
      display: "inline-block",
      color: "#2563eb",
      background: "#fff",
      marginRight: 8
    }}>Trip Assignment</Link>
    <Link to="/SupplierTripAssignment" style={{
      fontWeight: 500,
      textDecoration: "none",
      padding: "10px 18px",
      borderRadius: 6,
      transition: "background 0.2s, color 0.2s, border 0.2s",
      fontSize: 16,
      letterSpacing: 0.2,
      border: "1px solid #2563eb",
      outline: "none",
      cursor: "pointer",
      display: "inline-block",
      color: "#2563eb",
      background: "#fff",
      marginRight: 8
    }}>Supplier Trip Assignment</Link>
    <Link to="/RetailersLocations" style={{
      fontWeight: 500,
      textDecoration: "none",
      padding: "10px 18px",
      borderRadius: 6,
      transition: "background 0.2s, color 0.2s, border 0.2s",
      fontSize: 16,
      letterSpacing: 0.2,
      border: "1px solid #2563eb",
      outline: "none",
      cursor: "pointer",
      display: "inline-block",
      color: "#2563eb",
      background: "#fff",
      marginRight: 8
    }}>Retailers Locations</Link>
    <button onClick={handleAutoCommit} style={{ marginLeft: 'auto', padding: '8px 18px', borderRadius: 7, fontWeight: 600, fontSize: 15, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}>
      Auto Commit
    </button>
  </nav>
);

export default Navbar;
