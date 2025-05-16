import React, { useState } from "react";
import { loadSheetData } from "../utils/googleSheets";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { getCBMWeightAppScriptStyle } from "./CBMCalculator.jsx";
import Lottie from "lottie-react";
import animationData from "../../../lottieload.json";
import CBM from '../../../CBM.json';
import CBM_Main from '../../../CBM_Main.json';
import lottieload from '../../../lottieload.json';
import IntroJs from 'intro.js';
import 'intro.js/minified/introjs.min.css';

// --- Helper functions ported from Python ---

function safeFloat(value, def = 0.0) {
  if (value === null || value === undefined || value === "") return def;
  const f = parseFloat(value);
  return isNaN(f) ? def : f;
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  lat1 = safeFloat(lat1);
  lon1 = safeFloat(lon1);
  lat2 = safeFloat(lat2);
  lon2 = safeFloat(lon2);
  if ((lat1 === 0 && lon1 === 0) || (lat2 === 0 && lon2 === 0)) return 0.0;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// --- Main Trip Assignment Logic: All Phases (adapted from trip_assignment.py) ---

// Use fixed values for vehicle limits (e.g., Dababa)
const DIMENSION_MAX = 4.9;
const WEIGHT_MAX = 1800;
const MERGED_DIMENSION_MAX = DIMENSION_MAX + 0.1;
const MAX_TRIP_DISTANCE = 60;
const MAX_CUSTOMER_DISTANCE = 20;
const SECOND_MERGE_THRESHOLD = 2.0;
const FAR_AWAY_THRESHOLD = 30;
const DEFAULT_DIMENSION = 0.1;
const DEFAULT_WEIGHT = 0.1;
const MAX_SUPPLIER_DISTANCE = 5;
const MAX_DIRECTION_DIFF = 0.5;

function assignTrips(data) {
  if (!data || data.length === 0) return [];
  // Helper to get column value with fallback
  const getCol = (row, key) => row[key] ?? row[key.toLowerCase()] ?? row[key.toUpperCase()];
  // Vehicle limits
  const MERGED_DIMENSION_MAX = DIMENSION_MAX + 0.1; // Keep a small buffer for merging

  // --- Phase 1: Initial trip formation ---
  // Prepare supplier locations and warehouse areas
  const supplierLocations = {};
  const supplierWarehouseAreas = {};
  data.forEach(row => {
    const sup = getCol(row, "sup_place_id");
    if (!supplierLocations[sup]) {
      supplierLocations[sup] = {
        lat: safeFloat(getCol(row, "supplier_latitude")),
        lon: safeFloat(getCol(row, "supplier_longitude"))
      };
      supplierWarehouseAreas[sup] = getCol(row, "warehouse_location_area");
    }
  });

  // Group orders by supplier and cluster
  const supplierClusterOrders = {};
  data.forEach(row => {
    const sup = getCol(row, "sup_place_id");
    const cluster = getCol(row, "cluster");
    const key = `${sup}_${cluster}`;
    if (!supplierClusterOrders[key]) supplierClusterOrders[key] = [];
    supplierClusterOrders[key].push(row);
  });

  // Calculate cluster centroids
  const clusterCentroids = {};
  data.forEach(row => {
    const cluster = getCol(row, "cluster");
    if (!clusterCentroids[cluster]) clusterCentroids[cluster] = [];
    clusterCentroids[cluster].push(row);
  });
  Object.keys(clusterCentroids).forEach(cluster => {
    const orders = clusterCentroids[cluster];
    clusterCentroids[cluster] = {
      lat: orders.reduce((sum, o) => sum + safeFloat(getCol(o, "customer_latitude")), 0) / orders.length,
      lon: orders.reduce((sum, o) => sum + safeFloat(getCol(o, "customer_longitude")), 0) / orders.length
    };
  });

  // Phase 1: Build trips
  let tripCounter = 1;
  const orderTripMap = {};
  let trips = [];
  Object.entries(supplierClusterOrders).forEach(([key, orders]) => {
    const [sup, cluster] = key.split("_");
    const farOrders = [];
    const closeOrders = [];
    orders.forEach(order => {
      const dist = haversine(
        supplierLocations[sup].lat,
        supplierLocations[sup].lon,
        safeFloat(getCol(order, "customer_latitude")),
        safeFloat(getCol(order, "customer_longitude"))
      );
      if (dist > FAR_AWAY_THRESHOLD) farOrders.push(order);
      else closeOrders.push(order);
    });

    function processOrders(orderList) {
      let regionOrders = [...orderList];
      while (regionOrders.length > 0) {
        let tripOrders = [];
        let totalDimension = 0;
        let totalWeight = 0;
        let totalDistance = 0;
        let tripId = `${sup}_Trip_${tripCounter++}`;
        // Take first order
        const first = regionOrders.shift();
        tripOrders.push(first);
        totalDimension += safeFloat(getCol(first, "order_dimension"), DEFAULT_DIMENSION);
        totalWeight += safeFloat(getCol(first, "Total Order Weight / KG"), DEFAULT_WEIGHT);
        totalDistance = haversine(
          supplierLocations[sup].lat,
          supplierLocations[sup].lon,
          safeFloat(getCol(first, "customer_latitude")),
          safeFloat(getCol(first, "customer_longitude"))
        );
        orderTripMap[getCol(first, "id")] = tripId;

        // Try to add more orders to this trip
        let i = 0;
        while (i < regionOrders.length) {
          const next = regionOrders[i];
          const newDimension = totalDimension + safeFloat(getCol(next, "order_dimension"), DEFAULT_DIMENSION);
          const newWeight = totalWeight + safeFloat(getCol(next, "Total Order Weight / KG"), DEFAULT_WEIGHT);
          const newDistance = haversine(
            supplierLocations[sup].lat,
            supplierLocations[sup].lon,
            safeFloat(getCol(next, "customer_latitude")),
            safeFloat(getCol(next, "customer_longitude"))
          );
          // Constraints: dimension, weight, distance
          if (
            newDimension <= DIMENSION_MAX &&
            newWeight <= WEIGHT_MAX &&
            newDistance < MAX_TRIP_DISTANCE
          ) {
            tripOrders.push(next);
            totalDimension = newDimension;
            totalWeight = newWeight;
            totalDistance = Math.max(totalDistance, newDistance);
            orderTripMap[getCol(next, "id")] = tripId;
            regionOrders.splice(i, 1);
          } else {
            i++;
          }
        }
        // Save trip
        trips.push({
          tripId,
          supplier: sup,
          cluster,
          orders: tripOrders,
          totalDimension,
          totalWeight,
          totalDistance,
          avgLat: tripOrders.reduce((sum, o) => sum + safeFloat(getCol(o, "customer_latitude")), 0) / tripOrders.length,
          avgLon: tripOrders.reduce((sum, o) => sum + safeFloat(getCol(o, "customer_longitude")), 0) / tripOrders.length,
        });
      }
    }

    processOrders(farOrders);
    processOrders(closeOrders);
  });

  // --- Phase 1 merging: merge trips in same cluster if possible ---
  let mergedTrips = [];
  let tripsToMerge = trips.filter(t => t.totalDimension < DIMENSION_MAX);
  mergedTrips = mergedTrips.concat(trips.filter(t => t.totalDimension >= DIMENSION_MAX));
  let iterationLimit = 1000, iterationCount = 0;
  while (tripsToMerge.length && iterationCount < iterationLimit) {
    iterationCount++;
    const current = tripsToMerge.shift();
    let bestIdx = -1, minDist = Infinity;
    for (let i = 0; i < tripsToMerge.length; i++) {
      const other = tripsToMerge[i];
      if (current.supplier !== other.supplier || current.cluster !== other.cluster) continue;
      const dist = haversine(current.avgLat, current.avgLon, other.avgLat, other.avgLon);
      if (
        current.totalDimension + other.totalDimension <= MERGED_DIMENSION_MAX &&
        current.totalWeight + other.totalWeight <= WEIGHT_MAX &&
        dist < MAX_CUSTOMER_DISTANCE &&
        dist < minDist
      ) {
        minDist = dist;
        bestIdx = i;
      }
    }
    if (bestIdx !== -1) {
      const other = tripsToMerge.splice(bestIdx, 1)[0];
      const merged = {
        tripId: current.tripId,
        supplier: current.supplier,
        cluster: current.cluster,
        orders: [...current.orders, ...other.orders],
        totalDimension: current.totalDimension + other.totalDimension,
        totalWeight: current.totalWeight + other.totalWeight,
        totalDistance: Math.max(current.totalDistance, other.totalDistance),
        avgLat: ([...current.orders, ...other.orders].reduce((sum, o) => sum + safeFloat(getCol(o, "customer_latitude")), 0)) / ([...current.orders, ...other.orders].length),
        avgLon: ([...current.orders, ...other.orders].reduce((sum, o) => sum + safeFloat(getCol(o, "customer_longitude")), 0)) / ([...current.orders, ...other.orders].length),
      };
      merged.orders.forEach(o => { orderTripMap[getCol(o, "id")] = merged.tripId; });
      if (merged.totalDimension < DIMENSION_MAX) tripsToMerge.push(merged);
      else mergedTrips.push(merged);
    } else {
      mergedTrips.push(current);
    }
  }

  // --- Phase 2: Secondary merging (merge small trips in same supplier/cluster) ---
  let phase2Trips = mergedTrips;
  let phase2TripsToMerge = phase2Trips.filter(t => t.totalDimension < SECOND_MERGE_THRESHOLD);
  let phase2Merged = phase2Trips.filter(t => t.totalDimension >= SECOND_MERGE_THRESHOLD);
  iterationCount = 0;
  while (phase2TripsToMerge.length && iterationCount < iterationLimit) {
    iterationCount++;
    const current = phase2TripsToMerge.shift();
    let bestIdx = -1, minDist = Infinity;
    for (let i = 0; i < phase2Merged.length; i++) {
      const other = phase2Merged[i];
      if (current.supplier !== other.supplier || current.cluster !== other.cluster) continue;
      const dist = haversine(current.avgLat, current.avgLon, other.avgLat, other.avgLon);
      if (
        current.totalDimension + other.totalDimension <= MERGED_DIMENSION_MAX &&
        current.totalWeight + other.totalWeight <= WEIGHT_MAX &&
        dist < MAX_CUSTOMER_DISTANCE &&
        dist < minDist
      ) {
        minDist = dist;
        bestIdx = i;
      }
    }
    if (bestIdx !== -1) {
      const other = phase2Merged[bestIdx];
      const merged = {
        tripId: current.tripId,
        supplier: current.supplier,
        cluster: current.cluster,
        orders: [...current.orders, ...other.orders],
        totalDimension: current.totalDimension + other.totalDimension,
        totalWeight: current.totalWeight + other.totalWeight,
        totalDistance: Math.max(current.totalDistance, other.totalDistance),
        avgLat: ([...current.orders, ...other.orders].reduce((sum, o) => sum + safeFloat(getCol(o, "customer_latitude")), 0)) / ([...current.orders, ...other.orders].length),
        avgLon: ([...current.orders, ...other.orders].reduce((sum, o) => sum + safeFloat(getCol(o, "customer_longitude")), 0)) / ([...current.orders, ...other.orders].length),
      };
      merged.orders.forEach(o => { orderTripMap[getCol(o, "id")] = merged.tripId; });
      phase2Merged[bestIdx] = merged;
    } else {
      phase2Merged.push(current);
    }
  }

  // --- Phase 3: Cross-supplier merging (merge trips from nearby suppliers with similar direction) ---
  let phase3Trips = phase2Merged;

  // --- Final assignment to data ---
  return data.map(row => ({
    ...row,
    Trip_ID: orderTripMap[getCol(row, "id")] || ""
  }));
}

// --- Phase 1: Calculate CBM/Weight for Runsheet, then aggregate per order ---
function calculateRunsheetCBMWeight(runsheet, fallbackData) {
  // For each row in runsheet, calculate CBM/weight using fallback logic (same as CBMCalculator)
  return (runsheet || []).map(row => {
    // Map required fields for fallback logic
    const cbmResult = getCBMWeightAppScriptStyle(row, fallbackData || []);
    let qty = parseFloat(row.product_amount);
    if (isNaN(qty) || qty <= 0) qty = 1;
    return {
      ...row,
      cbm_confidence: cbmResult.confidence,
      calculated_cbm: (cbmResult.cbm || 0) * qty,
      calculated_weight: ((cbmResult.weight || 0) * qty) / 1000
    };
  });
}

function aggregateOrderMetrics(tasks, runsheetWithCBM) {
  // Build a lookup: task_id as string for robust matching
  const byOrderId = {};
  (runsheetWithCBM || []).forEach((row) => {
    const orderId = (row.task_id).toString().trim();
    if (!orderId) return;
    if (!byOrderId[orderId]) byOrderId[orderId] = [];
    byOrderId[orderId].push(row);
  });

  return tasks.map((task) => {
    const id = (task.id ?? task.ID ?? task.task_id ?? "").toString().trim();
    const products = byOrderId[id] || [];
    let totalCBM = 0,
      totalWeight = 0,
      totalGMV = 0;
    products.forEach((prod) => {
      totalCBM += safeFloat(prod.calculated_cbm ?? 0);
      totalWeight += safeFloat(prod.calculated_weight ?? 0);
      let gmv = 0;
      if (prod.product_amount && prod.product_price) {
        gmv = safeFloat(prod.product_amount) * safeFloat(prod.product_price);
      } else if (prod.product_gmv) {
        gmv = safeFloat(prod.product_gmv);
      }
      totalGMV += gmv;
    });
    return {
      ...task,
      order_dimension: totalCBM,
      "Total Order Weight / KG": totalWeight,
      order_gmv: totalGMV,
    };
  });
}

// --- UI Component ---

const TripAssignment = () => {
  const [tasksData, setTasksData] = useState([]);
  const [runsheetData, setRunsheetData] = useState([]);
  const [fallbackData, setFallbackData] = useState([]);
  const [phase1Data, setPhase1Data] = useState([]);
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [phase, setPhase] = useState(0); // 0=idle, 1=measuring, 2=loading, 3=done, 4=summary

  // Download the current Tasks sheet as Excel
  const handleDownloadTasks = () => {
    if (!tasksData.length) return;
    const ws = XLSX.utils.json_to_sheet(tasksData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tasks");
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/octet-stream" });
    saveAs(blob, "tasks_sheet.xlsx");
  };

  // Download the results as Excel
  const handleDownloadResults = () => {
    if (!results.length) return;
    const ws = XLSX.utils.json_to_sheet(results);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "AssignedTrips");
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/octet-stream" });
    saveAs(blob, "assigned_trips.xlsx");
  };

  // --- Animated Phase UI ---
  const renderPhaseAnimation = () => {
    if (phase === 1) {
      // Single animation phase for 7 seconds
      return (
        <div style={{ textAlign: "center", margin: "60px 0" }}>
          <Lottie animationData={animationData} loop={true} style={{ width: 260, height: 260, margin: "0 auto" }} />
          <div style={{ fontSize: 22, fontWeight: 600, color: "#2563eb", marginTop: 18 }}>
            Assigning trips, please wait...
          </div>
        </div>
      );
    }
    return null;
  };

  // One-click process: load, calculate, assign, with single animation phase
  const handleStart = async () => {
    setPhase(1); // Show animation
    setError("");
    setShowSuccess(false);
    setShowSummary(false);
    setResults([]);
    setPhase1Data([]);
    setLoading(true);

    // Start animation for 7 seconds, do processing in background
    setTimeout(async () => {
      // Do the actual processing in the background
      try {
        const [tasks, runsheet, fallback] = await Promise.all([
          loadSheetData("Tasks"),
          loadSheetData("Runsheet"),
          loadSheetData("Fallback"),
        ]);
        setTasksData(tasks);
        setRunsheetData(runsheet);
        setFallbackData(fallback);
        const runsheetWithCBM = calculateRunsheetCBMWeight(runsheet, fallback);
        const updated = aggregateOrderMetrics(tasks, runsheetWithCBM);
        setPhase1Data(updated);
        const res = assignTrips(updated);
        setResults(res);
      } catch (e) {
        setError("Process failed: " + (e?.message || e));
      }
      setPhase(4); // Show summary/download
      setShowSuccess(true);
      setLoading(false);
    }, 2000); // 7 seconds for animation
  };

  // Add a helper to start the tour
  const startTour = () => {
    IntroJs().setOptions({
      steps: [
        {
          element: document.querySelector('h1'),
          intro: 'Welcome to the Trip Assignment Overview! This is your main dashboard.'
        },
        {
          element: document.querySelector('button'),
          intro: 'Click here to start the trip assignment process.'
        },
        {
          element: document.querySelector('table'),
          intro: 'Here you will see the results and summary tables after processing.'
        }
      ],
      showProgress: true,
      showBullets: false,
      exitOnOverlayClick: true,
      nextLabel: 'Next',
      prevLabel: 'Back',
      doneLabel: 'Finish'
    }).start();
  };

  // Summary calculation
  const summary = React.useMemo(() => {
    if (!results.length) return null;
    // Totals
    const totalTrips = new Set(results.map(r => r.Trip_ID)).size;
    const validOrders = results.filter(r => r.id || r.ID || r.task_id);
    const totalOrders = validOrders.length;
    const totalCBM = validOrders.reduce((sum, r) => sum + safeFloat(r.order_dimension), 0);
    const totalWeight = validOrders.reduce((sum, r) => sum + safeFloat(r["Total Order Weight / KG"]), 0);
    const totalGMV = validOrders.reduce((sum, r) => sum + safeFloat(r.order_gmv), 0);

    // Supplier level
    const supplierStats = {};
    results.forEach(r => {
      const sup = r.sup_place_id || "Unknown";
      if (!supplierStats[sup]) supplierStats[sup] = { orders: 0, cbm: 0, weight: 0, gmv: 0, trips: new Set() };
      supplierStats[sup].orders += 1;
      supplierStats[sup].cbm += safeFloat(r.order_dimension);
      supplierStats[sup].weight += safeFloat(r["Total Order Weight / KG"]);
      supplierStats[sup].gmv += safeFloat(r.order_gmv);
      supplierStats[sup].trips.add(r.Trip_ID);
    });

    // Area level
    const areaStats = {};
    results.forEach(r => {
      const area = r.customer_area || "Unknown";
      if (!areaStats[area]) areaStats[area] = { orders: 0, cbm: 0, weight: 0, gmv: 0 };
      areaStats[area].orders += 1;
      areaStats[area].cbm += safeFloat(r.order_dimension);
      areaStats[area].weight += safeFloat(r["Total Order Weight / KG"]);
      areaStats[area].gmv += safeFloat(r.order_gmv);
    });

    return {
      totalTrips,
      totalOrders,
      totalCBM,
      totalWeight,
      totalGMV,
      supplierStats,
      areaStats,
    };
  }, [results]);

  // UI
  return (
    <div
      className="responsive-padding"
      style={{
        padding: "32px",
        margin: "0 auto",
        fontFamily: "Inter, Segoe UI, Arial, sans-serif",
        background: "linear-gradient(120deg, #f8fafc 0%, #e0e7ef 100%)",
        minHeight: "100vh",
        borderRadius: 18,
        boxShadow: "0 8px 32px 0 rgba(31, 38, 135, 0.12)",
        position: "relative"
      }}
    >
      {/* Header (match CBMCalculator style) */}
      <div className="responsive-header" style={{
        background: 'linear-gradient(90deg, #2563eb 0%, #38bdf8 100%)',
        borderRadius: 14,
        padding: '36px 28px 24px 28px',
        marginBottom: 32,
        color: '#fff',
        boxShadow: '0 4px 24px 0 rgba(37,99,235,0.08)',
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        position: 'relative'
      }}>
        <img
          src="https://cdn-icons-png.flaticon.com/512/2921/2921222.png"
          alt="Trip"
          style={{
            width: 56,
            height: 56,
            marginRight: 18,
            borderRadius: 8,
            background: '#fff',
            boxShadow: '0 2px 8px 0 rgba(37,99,235,0.10)'
          }}
        />
        <div>
          <h1 style={{
            margin: 0,
            fontWeight: 800,
            fontSize: 38,
            letterSpacing: '-1.5px',
            lineHeight: 1.1,
            textShadow: '0 2px 8px rgba(37,99,235,0.10)'
          }}>
            Trip Assignment Overview
          </h1>
          <div style={{
            fontSize: 21,
            opacity: 0.96,
            marginTop: 6,
            fontWeight: 500,
            letterSpacing: '-0.5px'
          }}>
            Assign, View, Download. <span style={{ color: '#fbbf24', fontWeight: 700 }}>All in one place!</span>
          </div>
        </div>
        <div style={{
          position: 'absolute',
          right: 28,
          top: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 10
        }}>
          <a
            href="Start-Onboarding"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: '#fff',
              background: 'rgba(37,99,235,0.18)',
              borderRadius: 7,
              padding: '7px 16px',
              fontWeight: 600,
              fontSize: 15,
              textDecoration: 'none',
              transition: 'background 0.2s'
            }}
          >
            Need Help?
          </a>
          <a
            href="mailto:karem.said@cartona.com"
            style={{
              color: '#fff',
              background: 'rgba(251,191,36,0.18)',
              borderRadius: 7,
              padding: '7px 16px',
              fontWeight: 600,
              fontSize: 15,
              textDecoration: 'none',
              transition: 'background 0.2s'
            }}
          >
            Contact Support
          </a>
          <a
            href="#"
            onClick={e => { e.preventDefault(); startTour(); }}
            style={{
              color: '#fff',
              background: 'rgba(16,185,129,0.18)',
              borderRadius: 7,
              padding: '7px 16px',
              fontWeight: 600,
              fontSize: 15,
              textDecoration: 'none',
              transition: 'background 0.2s',
              marginLeft: 10
            }}
          >
            Guided Tour
          </a>
        </div>
      </div>

      {/* Action Buttons */}
      <div
        className="responsive-flex responsive-padding"
        style={{
          background: "#fff",
          borderRadius: 14,
          padding: 28,
          boxShadow: "0 2px 12px 0 rgba(0,0,0,0.04)",
          marginBottom: 32,
          display: "flex",
          alignItems: "center",
          gap: 24,
          flexWrap: "wrap"
        }}
      >
        <button
          onClick={handleStart}
          disabled={loading}
          style={{
            background: "linear-gradient(90deg, #2563eb 0%, #38bdf8 100%)",
            color: "#fff",
            padding: "14px 38px",
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 18,
            border: "none",
            cursor: loading ? "not-allowed" : "pointer",
            boxShadow: "0 2px 8px 0 rgba(37,99,235,0.08)",
            opacity: loading ? 0.7 : 1,
            minWidth: 180
          }}
        >
          {loading ? (
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="loader" style={{
                width: 22, height: 22, border: "3px solid #fff", borderTop: "3px solid #38bdf8",
                borderRadius: "50%", display: "inline-block", animation: "spin 1s linear infinite"
              }} />
              Processing...
            </span>
          ) : (
            "Start"
          )}
        </button>
        <button
          onClick={handleDownloadTasks}
          style={{
            background: "linear-gradient(90deg, #22c55e 0%, #bef264 100%)",
            color: "#fff",
            padding: "12px 28px",
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 16,
            border: "none",
            cursor: "pointer",
            boxShadow: "0 2px 8px 0 rgba(34,197,94,0.08)",
            minWidth: 160
          }}
        >
          Download Tasks Sheet
        </button>
        {results.length > 0 && (
          <button
            onClick={handleDownloadResults}
            style={{
              background: "linear-gradient(90deg, #f59e42 0%, #fbbf24 100%)",
              color: "#fff",
              padding: "12px 28px",
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 16,
              border: "none",
              cursor: "pointer",
              boxShadow: "0 2px 8px 0 rgba(251,191,36,0.08)",
              minWidth: 160
            }}
          >
            Download Assigned Trips
          </button>
        )}
      </div>

      {/* Loader animation CSS */}
      <style>
        {`
        @keyframes spin {
          0% { transform: rotate(0deg);}
          100% { transform: rotate(360deg);}
        }
        `}
      </style>

      {/* Animated Phases */}
      {phase === 1 && renderPhaseAnimation()}

      {/* Error */}
      {error && (
        <div
          style={{
            background: "#fee2e2",
            color: "#b91c1c",
            padding: "14px 18px",
            borderRadius: 8,
            marginTop: 18,
            fontWeight: 500,
          }}
        >
          {error}
        </div>
      )}
    
      {/* Summary Section (moved from modal, styled like CBMCalculator) */}
      {summary && (
        <div className="responsive-summary responsive-padding" style={{
          background: '#fff',
          borderRadius: 18,
          padding: '40px 36px 28px 36px',
          boxShadow: '0 2px 12px 0 rgba(0,0,0,0.04)',
          width: '100%',
          minHeight: 420,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          margin: 0,
          boxSizing: 'border-box',
          overflow: 'hidden',
          marginBottom: 32
        }}>
          <h2 style={{ 
            color: '#2563eb', 
            fontWeight: 700, 
            marginBottom: 32, 
            fontSize: 32, 
            textAlign: 'center', 
            width: '100%'
          }}>
            Trip Assignment Summary
          </h2>
          <div style={{
            display: 'flex',
            gap: 32,
            flexWrap: 'wrap',
            justifyContent: 'center',
            marginBottom: 24,
            width: '100%'
          }}>
            <div style={{
              background: 'linear-gradient(90deg, #2563eb 0%, #38bdf8 100%)',
              color: '#fff',
              borderRadius: 12,
              padding: '28px 22px',
              minWidth: 200,
              textAlign: 'center',
              flex: 1,
              margin: '0 16px',
              fontSize: 22
            }}>
              <div style={{ fontSize: 18, opacity: 0.9 }}>Total Trips</div>
              <div style={{ fontWeight: 700, fontSize: 32 }}>{summary.totalTrips}</div>
            </div>
            <div style={{
              background: 'linear-gradient(90deg, #2563eb 0%, #38bdf8 100%)',
              color: '#fff',
              borderRadius: 12,
              padding: '28px 22px',
              minWidth: 200,
              textAlign: 'center',
              flex: 1,
              margin: '0 16px',
              fontSize: 22
            }}>
              <div style={{ fontSize: 18, opacity: 0.9 }}>Total Orders</div>
              <div style={{ fontWeight: 700, fontSize: 32 }}>{summary.totalOrders}</div>
            </div>
            <div style={{
              background: 'linear-gradient(90deg, #2563eb 0%, #38bdf8 100%)',
              color: '#fff',
              borderRadius: 12,
              padding: '28px 22px',
              minWidth: 200,
              textAlign: 'center',
              flex: 1,
              margin: '0 16px',
              fontSize: 22
            }}>
              <div style={{ fontSize: 18, opacity: 0.9 }}>Total CBM</div>
              <div style={{ fontWeight: 700, fontSize: 32 }}>{summary.totalCBM.toFixed(2)}</div>
            </div>
            <div style={{
              background: 'linear-gradient(90deg, #2563eb 0%, #38bdf8 100%)',
              color: '#fff',
              borderRadius: 12,
              padding: '28px 22px',
              minWidth: 200,
              textAlign: 'center',
              flex: 1,
              margin: '0 16px',
              fontSize: 22
            }}>
              <div style={{ fontSize: 18, opacity: 0.9 }}>Total Weight</div>
              <div style={{ fontWeight: 700, fontSize: 32 }}>{summary.totalWeight.toFixed(2)} kg</div>
            </div>
            <div style={{
              background: 'linear-gradient(90deg, #f59e42 0%, #fbbf24 100%)',
              color: '#fff',
              borderRadius: 12,
              padding: '28px 22px',
              minWidth: 200,
              textAlign: 'center',
              flex: 1,
              margin: '0 16px',
              fontSize: 22
            }}>
              <div style={{ fontSize: 18, opacity: 0.9 }}>Total GMV</div>
              <div style={{ fontWeight: 700, fontSize: 32 }}>{summary.totalGMV.toFixed(2)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Supplier Level Table (styled like CBMCalculator) */}
      {summary && (
        <div className="responsive-padding" style={{ background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 2px 12px 0 rgba(0,0,0,0.04)', marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ color: '#0f172a', fontWeight: 700, fontSize: 20, marginBottom: 0 }}>
              Supplier View
            </h3>
          </div>
          <div className="responsive-table-wrapper">
            <table className="responsive-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15, background: '#f8fafc', borderRadius: 10, overflow: 'hidden' }}>
              <thead>
                <tr style={{ background: '#e0e7ef' }}>
                  <th style={{ padding: '10px 8px' }}>Supplier</th>
                  <th style={{ padding: '10px 8px' }}>Orders</th>
                  <th style={{ padding: '10px 8px' }}>CBM</th>
                  <th style={{ padding: '10px 8px' }}>Weight</th>
                  <th style={{ padding: '10px 8px' }}>GMV</th>
                  <th style={{ padding: '10px 8px' }}>Trips</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(summary.supplierStats).slice(0, 15).map(([sup, stat]) => (
                  <tr key={sup} style={{ background: '#fff' }}>
                    <td style={{ padding: '8px 8px' }}>{sup}</td>
                    <td style={{ padding: '8px 8px' }}>{stat.orders}</td>
                    <td style={{ padding: '8px 8px' }}>{stat.cbm.toFixed(2)}</td>
                    <td style={{ padding: '8px 8px' }}>{stat.weight.toFixed(2)}</td>
                    <td style={{ padding: '8px 8px' }}>{stat.gmv.toFixed(2)}</td>
                    <td style={{ padding: '8px 8px' }}>{stat.trips.size}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {Object.entries(summary.supplierStats).length > 15 && (
              <div style={{ color: '#64748b', fontSize: 14, marginTop: 8 }}>
                Showing first 15 rows. Download for full data.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Area Level Table (styled like CBMCalculator) */}
      {summary && (
        <div className="responsive-padding" style={{ background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 2px 12px 0 rgba(0,0,0,0.04)', marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ color: '#0f172a', fontWeight: 700, fontSize: 20, marginBottom: 0 }}>
              Area View
            </h3>
          </div>
          <div className="responsive-table-wrapper">
            <table className="responsive-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15, background: '#f8fafc', borderRadius: 10, overflow: 'hidden' }}>
              <thead>
                <tr style={{ background: '#e0e7ef' }}>
                  <th style={{ padding: '10px 8px' }}>Area</th>
                  <th style={{ padding: '10px 8px' }}>Orders</th>
                  <th style={{ padding: '10px 8px' }}>CBM</th>
                  <th style={{ padding: '10px 8px' }}>Weight</th>
                  <th style={{ padding: '10px 8px' }}>GMV</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(summary.areaStats).slice(0, 15).map(([area, stat]) => (
                  <tr key={area} style={{ background: '#fff' }}>
                    <td style={{ padding: '8px 8px' }}>{area}</td>
                    <td style={{ padding: '8px 8px' }}>{stat.orders}</td>
                    <td style={{ padding: '8px 8px' }}>{stat.cbm.toFixed(2)}</td>
                    <td style={{ padding: '8px 8px' }}>{stat.weight.toFixed(2)}</td>
                    <td style={{ padding: '8px 8px' }}>{stat.gmv.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {Object.entries(summary.areaStats).length > 15 && (
              <div style={{ color: '#64748b', fontSize: 14, marginTop: 8 }}>
                Showing first 15 rows. Download for full data.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Remove summary from modal, keep only the close button and intro */}
      {showSummary && summary && (
        <div
          style={{
            position: "fixed",
            top: 0, left: 0, width: "100vw", height: "100vh",
            background: "rgba(0,0,0,0.18)",
            zIndex: 1000,
            display: "flex", alignItems: "center", justifyContent: "center"
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: "36px 32px",
              boxShadow: "0 8px 32px 0 rgba(31, 38, 135, 0.18)",
              minWidth: 420,
              maxWidth: 700,
              textAlign: "center"
            }}
          >
            <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 10, color: "#2563eb" }}>
              Assignment Summary
            </div>
            <div style={{ fontSize: 16, color: "#64748b", marginBottom: 18 }}>
              Overview of all trips, suppliers, and areas.
            </div>
            <button
              onClick={() => setShowSummary(false)}
              style={{
                marginTop: 24,
                background: "linear-gradient(90deg, #2563eb 0%, #38bdf8 100%)",
                color: "#fff",
                padding: "12px 28px",
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 16,
                border: "none",
                cursor: "pointer"
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Results Table */}
      {results.length > 0 && (
        <div className="responsive-padding" style={{
          background: "#fff",
          borderRadius: 14,
          padding: 24,
          boxShadow: "0 2px 12px 0 rgba(0,0,0,0.04)",
          marginBottom: 32,
        }}
        >
          <h3 style={{ color: "#0f172a", fontWeight: 700, fontSize: 20, marginBottom: 10 }}>
            Assigned Trips (First 10 Rows)
          </h3>
          <div className="responsive-table-wrapper">
            <table className="responsive-table" style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 15,
              background: "#f8fafc",
              borderRadius: 10,
              overflow: "hidden",
            }}>
              <thead>
                <tr style={{ background: "#e0e7ef" }}>
                  {Object.keys(results[0])
                    .filter(col => col !== "Merged_Trip_ID")
                    .map((col) => (
                      <th
                        key={col}
                        style={{ padding: "10px 8px", fontWeight: 700, color: "#2563eb" }}
                      >
                        {col}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {results.slice(0, 10).map((row, idx) => (
                  <tr
                    key={idx}
                    style={{
                      background: idx % 2 === 0 ? "#fff" : "#f1f5f9",
                      borderBottom: "1px solid #e0e7ef",
                    }}
                  >
                    {Object.keys(row)
                      .filter(col => col !== "Merged_Trip_ID")
                      .map((col) => (
                        <td key={col} style={{ padding: "8px 8px" }}>
                          {row[col]}
                        </td>
                      ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {results.length > 10 && (
              <div style={{ color: "#64748b", fontSize: 14, marginTop: 8 }}>
                Showing first 10 rows. Download for full data.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer Note */}
      <div style={{ marginTop: 32, textAlign: "center", color: "#64748b", fontSize: 15 }}>
      </div>
    </div>
  );
};

export default TripAssignment;
