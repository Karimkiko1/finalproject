// This is a copy of TripAssignment.jsx, modified for specific supplier(s) assignment only.

import React, { useState, useEffect } from "react";
import { loadSheetData } from "../utils/googleSheets";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { getCBMWeightAppScriptStyle } from "./CBMCalculator.jsx";
import Lottie from "lottie-react";
import animationData from "../../../lottieload.json";

// --- Helper functions ported from Python ---

function safeFloat(value, def = 0.0) {
  if (value === null || value === undefined || value === "") return def;
  const f = parseFloat(value);
  return isNaN(f) ? def : f;
}

// --- Treat suppliers with same sup_place_id as one supplier ---
function getSupplierKey(row) {
  // Use sup_place_id if available, else fallback to supplier_name
  return row.sup_place_id || row.supplier_name || "";
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  lat1 = safeFloat(lat1);
  lon1 = safeFloat(lat1);
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

// --- Phase 1: Calculate CBM/Weight for Runsheet, then aggregate per order ---
function calculateRunsheetCBMWeight(runsheet, fallbackData) {
  return (runsheet || []).map(row => {
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

const VEHICLE_TYPES = [
  { label: "Jumbo", value: "jumbo", DIMENSION_MAX: 13.6, WEIGHT_MAX: 6000 },
  { label: "Dababa", value: "dababa", DIMENSION_MAX: 4.9, WEIGHT_MAX: 1800 },
  { label: "Suzuki", value: "suzuki", DIMENSION_MAX: 2.5, WEIGHT_MAX: 800 },
];

const SupplierTripAssignment = () => {
  const [tasksData, setTasksData] = useState([]);
  const [runsheetData, setRunsheetData] = useState([]);
  const [fallbackData, setFallbackData] = useState([]);
  const [phase1Data, setPhase1Data] = useState([]);
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState(0);
  const [allSuppliers, setAllSuppliers] = useState([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState([]);
  const [truckType, setTruckType] = useState(VEHICLE_TYPES[1].value);
  const [truckCount, setTruckCount] = useState(1);
  const [supplierNamesMap, setSupplierNamesMap] = useState({});

  // --- Use sup_place_id as the supplier key for all logic ---
  useEffect(() => {
    if (tasksData && tasksData.length > 0) {
      // Map sup_place_id to all supplier_name(s) for display
      const supIdToNames = {};
      tasksData.forEach(row => {
        const supId = getSupplierKey(row);
        if (!supIdToNames[supId]) supIdToNames[supId] = new Set();
        if (row.supplier_name) supIdToNames[supId].add(row.supplier_name);
      });
      // Save as array for rendering
      setAllSuppliers(
        Array.from(new Set(tasksData.map(row => getSupplierKey(row)).filter(Boolean)))
      );
      setSupplierNamesMap(
        Object.fromEntries(
          Object.entries(supIdToNames).map(([k, v]) => [k, Array.from(v)])
        )
      );
    }
  }, [tasksData]);

  // --- Trip assignment logic: use TripAssignment.jsx logic but filter by selected suppliers and use truck limits ---
  function assignTripsWithSupplierLimit(data, supplierList, truckType, truckCount) {
    if (!data || data.length === 0 || !supplierList.length) return [];
    // Only process orders for selected suppliers (by sup_place_id)
    const filtered = data.filter(row => supplierList.includes(getSupplierKey(row)));
    // Helper to get column value with fallback
    const getCol = (row, key) => row[key] ?? row[key.toLowerCase()] ?? row[key.toUpperCase()];
    // Get truck limits
    const VEHICLE_TYPES = [
      { label: "Jumbo", value: "jumbo", DIMENSION_MAX: 13.6, WEIGHT_MAX: 6000 },
      { label: "Dababa", value: "dababa", DIMENSION_MAX: 4.9, WEIGHT_MAX: 1800 },
      { label: "Suzuki", value: "suzuki", DIMENSION_MAX: 2.5, WEIGHT_MAX: 800 },
    ];
    const vehicle = VEHICLE_TYPES.find(v => v.value === truckType) || VEHICLE_TYPES[1];
    const DIMENSION_MAX = vehicle.DIMENSION_MAX * truckCount;
    const WEIGHT_MAX = vehicle.WEIGHT_MAX * truckCount;
    const MERGED_DIMENSION_MAX = DIMENSION_MAX + 0.1;
    const MAX_TRIP_DISTANCE = 60;
    const MAX_CUSTOMER_DISTANCE = 20;
    const SECOND_MERGE_THRESHOLD = 2.0;
    const FAR_AWAY_THRESHOLD = 30;
    const DEFAULT_DIMENSION = 0.1;
    const DEFAULT_WEIGHT = 0.1;

    // --- Phase 1: Initial trip formation (same as TripAssignment.jsx, but only for filtered data) ---
    // Prepare supplier locations and warehouse areas
    const supplierLocations = {};
    const supplierWarehouseAreas = {};
    filtered.forEach(row => {
      const sup = getSupplierKey(row);
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
    filtered.forEach(row => {
      const sup = getSupplierKey(row);
      const cluster = getCol(row, "cluster");
      const key = `${sup}_${cluster}`;
      if (!supplierClusterOrders[key]) supplierClusterOrders[key] = [];
      supplierClusterOrders[key].push(row);
    });

    // Calculate cluster centroids
    const clusterCentroids = {};
    filtered.forEach(row => {
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

    // --- Phase 3: Cross-supplier merging (not needed for supplier-limited assignment) ---
    // (Skip, as you want to keep suppliers separate.)

    // --- Final assignment to data ---
    return filtered.map(row => ({
      ...row,
      Trip_ID: orderTripMap[getCol(row, "id")] || ""
    }));
  }

  // Download the results as Excel
  const handleDownloadResults = () => {
    if (!results.length) return;
    const ws = XLSX.utils.json_to_sheet(results);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "SupplierTrips");
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/octet-stream" });
    saveAs(blob, "supplier_trips.xlsx");
  };

  // --- Animated Phase UI ---
  const renderPhaseAnimation = () => {
    if (phase === 1) {
      return (
        <div style={{ textAlign: "center", margin: "60px 0" }}>
          <Lottie animationData={animationData} loop={true} style={{ width: 260, height: 260, margin: "0 auto" }} />
          <div style={{ fontSize: 22, fontWeight: 600, color: "#2563eb", marginTop: 18 }}>
            Loading data, please wait...
          </div>
        </div>
      );
    }
    return null;
  };

  // Start: load all data, then show supplier selection
  const handleStart = async () => {
    setPhase(1);
    setError("");
    setResults([]);
    setPhase1Data([]);
    setLoading(true);
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
      setPhase(2); // Show supplier selection
    } catch (e) {
      setError("Process failed: " + (e?.message || e));
      setPhase(0);
    }
    setLoading(false);
  };

  // After supplier selection, assign trips
  const handleAssign = () => {
    setLoading(true);
    setError("");
    setResults([]);
    try {
      const res = assignTripsWithSupplierLimit(
        phase1Data,
        selectedSuppliers,
        truckType,
        truckCount
      );
      setResults(res);
      setPhase(3);
    } catch (e) {
      setError("Assignment failed: " + (e?.message || e));
    }
    setLoading(false);
  };

  // --- Fixed summary (overview numbers, not in a box) ---
  const summary = (() => {
    if (!phase1Data || phase1Data.length === 0) return null;
    const filtered = selectedSuppliers.length
      ? phase1Data.filter(r => selectedSuppliers.includes(getSupplierKey(r)))
      : phase1Data;
    const totalOrders = filtered.length;
    const totalCBM = filtered.reduce((sum, r) => sum + safeFloat(r.order_dimension), 0);
    const totalWeight = filtered.reduce((sum, r) => sum + safeFloat(r["Total Order Weight / KG"]), 0);
    const totalGMV = filtered.reduce((sum, r) => sum + safeFloat(r.order_gmv), 0);
    const uniqueTrips = new Set(filtered.map(r => r.Trip_ID)).size;
    const uniqueAreas = new Set(filtered.map(r => r.customer_area || "")).size;
    return {
      totalOrders,
      totalCBM,
      totalWeight,
      totalGMV,
      uniqueTrips,
      uniqueAreas
    };
  })();

  // --- Combined Trip Orders and Areas Table ---
  const tripAreaTable = (() => {
    if (!results || results.length === 0) return [];
    // Group by Trip_ID, collect order count and unique areas
    const tripMap = {};
    results.forEach(r => {
      const trip = r.Trip_ID || "No Trip";
      if (!tripMap[trip]) tripMap[trip] = { orders: 0, areas: new Set() };
      tripMap[trip].orders += 1;
      if (r.customer_area) tripMap[trip].areas.add(r.customer_area);
    });
    return Object.entries(tripMap).map(([trip, data]) => ({
      trip,
      orders: data.orders,
      areas: Array.from(data.areas).join(", ")
    }));
  })();

  // --- UI ---
  return (
    <div
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
      {/* Header */}
      <div
        style={{
          background: "linear-gradient(90deg, #be123c 0%, #fbbf24 100%)",
          borderRadius: 14,
          padding: "32px 24px 20px 24px",
          marginBottom: 32,
          color: "#fff",
          boxShadow: "0 4px 24px 0 rgba(251,191,36,0.08)",
          display: "flex",
          alignItems: "center",
          gap: 18,
        }}
      >
        <img
          src="https://cdn-icons-png.flaticon.com/512/2921/2921222.png"
          alt="Supplier Trip"
          style={{
            width: 56,
            height: 56,
            marginRight: 18,
            borderRadius: 8,
            background: "#fff",
          }}
        />
        <div>
          <h1 style={{ margin: 0, fontWeight: 700, fontSize: 32, letterSpacing: "-1px" }}>
            Supplier Trip Assignment
          </h1>
          <div style={{ fontSize: 17, opacity: 0.92, marginTop: 4 }}>
            Assign trips for specific supplier(s) only.
          </div>
        </div>
      </div>

      {/* --- Fixed summary as overview numbers --- */}
      {summary && (
        <div style={{
          display: "flex",
          gap: 36,
          marginBottom: 24,
          justifyContent: "center",
          flexWrap: "wrap"
        }}>
          <div style={{ minWidth: 120, textAlign: "center" }}>
            <div style={{ color: "#be123c", fontWeight: 700, fontSize: 28 }}>{summary.totalOrders}</div>
            <div style={{ color: "#64748b", fontWeight: 500 }}>Orders</div>
          </div>
          <div style={{ minWidth: 120, textAlign: "center" }}>
            <div style={{ color: "#2563eb", fontWeight: 700, fontSize: 28 }}>{summary.totalCBM.toFixed(2)}</div>
            <div style={{ color: "#64748b", fontWeight: 500 }}>Total CBM</div>
          </div>
          <div style={{ minWidth: 120, textAlign: "center" }}>
            <div style={{ color: "#22c55e", fontWeight: 700, fontSize: 28 }}>{summary.totalWeight.toFixed(2)}</div>
            <div style={{ color: "#64748b", fontWeight: 500 }}>Total Weight</div>
          </div>
          <div style={{ minWidth: 120, textAlign: "center" }}>
            <div style={{ color: "#f59e42", fontWeight: 700, fontSize: 28 }}>{summary.totalGMV.toFixed(2)}</div>
            <div style={{ color: "#64748b", fontWeight: 500 }}>Total GMV</div>
          </div>
          <div style={{ minWidth: 120, textAlign: "center" }}>
            <div style={{ color: "#0ea5e9", fontWeight: 700, fontSize: 28 }}>{summary.uniqueTrips}</div>
            <div style={{ color: "#64748b", fontWeight: 500 }}>Trips</div>
          </div>
          <div style={{ minWidth: 120, textAlign: "center" }}>
            <div style={{ color: "#a855f7", fontWeight: 700, fontSize: 28 }}>{summary.uniqueAreas}</div>
            <div style={{ color: "#64748b", fontWeight: 500 }}>Areas</div>
          </div>
        </div>
      )}

      {/* Step 1: Start */}
      {phase === 0 && (
        <div style={{ textAlign: "center", margin: "60px 0" }}>
          <button
            onClick={handleStart}
            disabled={loading}
            style={{
              background: "linear-gradient(90deg, #be123c 0%, #fbbf24 100%)",
              color: "#fff",
              padding: "16px 48px",
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 22,
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: "0 2px 8px 0 rgba(251,191,36,0.12)",
              minWidth: 260
            }}
          >
            {loading ? "Loading..." : "Start"}
          </button>
        </div>
      )}

      {/* Step 2: Supplier selection */}
      {phase === 2 && (
        <div
          style={{
            background: "#fff",
            borderRadius: 22,
            padding: "48px 56px",
            boxShadow: "0 8px 32px 0 rgba(31, 38, 135, 0.18)",
            minWidth: 540,
            maxWidth: 900,
            margin: "0 auto",
            marginBottom: 32,
            textAlign: "center"
          }}
        >
          <div style={{ fontSize: 26, fontWeight: 700, marginBottom: 28, color: "#be123c" }}>
            Select Supplier(s) and Truck Options
          </div>
          <div style={{ marginBottom: 28, width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <label style={{ fontWeight: 600, color: "#2563eb", fontSize: 18, marginBottom: 12, display: "block" }}>
              Suppliers:
            </label>
            <div style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 18,
              justifyContent: "center",
              marginBottom: 10,
              maxWidth: 600
            }}>
              {allSuppliers.map(sup => (
                <label
                  key={sup}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    background: selectedSuppliers.includes(sup)
                      ? "linear-gradient(90deg, #2563eb 0%, #38bdf8 100%)"
                      : "#f1f5f9",
                    color: selectedSuppliers.includes(sup) ? "#fff" : "#2563eb",
                    borderRadius: 8,
                    padding: "8px 18px",
                    fontWeight: 600,
                    fontSize: 16,
                    cursor: "pointer",
                    border: selectedSuppliers.includes(sup) ? "2px solid #2563eb" : "1.5px solid #cbd5e1",
                    marginBottom: 6,
                    minWidth: 120,
                    justifyContent: "center"
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedSuppliers.includes(sup)}
                    onChange={e => {
                      if (e.target.checked) {
                        setSelectedSuppliers([...selectedSuppliers, sup]);
                      } else {
                        setSelectedSuppliers(selectedSuppliers.filter(s => s !== sup));
                      }
                    }}
                    style={{ marginRight: 10, width: 18, height: 18 }}
                  />
                  {sup}
                  {/* Show supplier names in () if available */}
                  {supplierNamesMap[sup] && supplierNamesMap[sup].length > 0 && (
                    <span style={{ color: "#64748b", fontWeight: 400, marginLeft: 6, fontSize: 14 }}>
                      ({supplierNamesMap[sup].join(", ")})
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 18, width: "100%", display: "flex", justifyContent: "center", gap: 24 }}>
            <div>
              <label style={{ fontWeight: 600, color: "#2563eb", fontSize: 16, marginBottom: 6, display: "block" }}>
                Truck Type:
              </label>
              <select
                value={truckType}
                onChange={e => setTruckType(e.target.value)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 7,
                  border: "1.5px solid #cbd5e1",
                  fontSize: 16,
                  minWidth: 140,
                  outline: "none",
                  color: "#2563eb",
                  fontWeight: 600,
                  background: "#f8fafc"
                }}
              >
                {VEHICLE_TYPES.map(v => (
                  <option key={v.value} value={v.value}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontWeight: 600, color: "#2563eb", fontSize: 16, marginBottom: 6, display: "block" }}>
                Truck Count:
              </label>
              <input
                type="number"
                min={1}
                value={truckCount}
                onChange={e => setTruckCount(Number(e.target.value))}
                style={{
                  width: 80,
                  padding: "8px 10px",
                  borderRadius: 7,
                  border: "1.5px solid #cbd5e1",
                  fontSize: 16,
                  outline: "none",
                  color: "#2563eb",
                  fontWeight: 600,
                  background: "#f8fafc"
                }}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 18, justifyContent: "center", width: "100%", marginTop: 18 }}>
            <button
              onClick={handleAssign}
              disabled={
                loading ||
                !selectedSuppliers.length ||
                !truckType ||
                !truckCount
              }
              style={{
                background: "linear-gradient(90deg, #be123c 0%, #fbbf24 100%)",
                color: "#fff",
                padding: "14px 38px",
                borderRadius: 10,
                fontWeight: 700,
                fontSize: 18,
                border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: "0 2px 8px 0 rgba(251,191,36,0.12)",
                minWidth: 200
              }}
            >
              Assign for Supplier(s)
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Results */}
      {phase === 3 && results.length > 0 && (
        <>
          <div
            style={{
              background: "#fff",
              borderRadius: 14,
              padding: 24,
              boxShadow: "0 2px 12px 0 rgba(0,0,0,0.04)",
              marginBottom: 32,
            }}
          >
            <h3 style={{ color: "#0f172a", fontWeight: 700, fontSize: 20, marginBottom: 10 }}>
              Assigned Trips for Selected Supplier(s)
            </h3>
            <div style={{ marginBottom: 18 }}>
              <button
                onClick={handleDownloadResults}
                style={{
                  background: "linear-gradient(90deg, #2563eb 0%, #38bdf8 100%)",
                  color: "#fff",
                  padding: "12px 28px",
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 16,
                  border: "none",
                  cursor: "pointer",
                  marginBottom: 12
                }}
              >
                Download Data
              </button>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 15,
                  background: "#f8fafc",
                  borderRadius: 10,
                  overflow: "hidden",
                }}
              >
                <thead>
                  <tr style={{ background: "#e0e7ef" }}>
                    {Object.keys(results[0]).map((col) => (
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
                  {results.slice(0, 20).map((row, idx) => (
                    <tr
                      key={idx}
                      style={{
                        background: idx % 2 === 0 ? "#fff" : "#f1f5f9",
                        borderBottom: "1px solid #e0e7ef",
                      }}
                    >
                      {Object.keys(row).map((col) => (
                        <td key={col} style={{ padding: "8px 8px" }}>
                          {row[col]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {results.length > 20 && (
                <div style={{ color: "#64748b", fontSize: 14, marginTop: 8 }}>
                  Showing first 20 rows. Download for full data.
                </div>
              )}
            </div>
          </div>
          {/* --- Combined Trip Orders and Areas Table --- */}
          <div
            style={{
              background: "#fff",
              borderRadius: 14,
              padding: 24,
              boxShadow: "0 2px 12px 0 rgba(0,0,0,0.04)",
              marginBottom: 32,
            }}
          >
            <h3 style={{ color: "#0f172a", fontWeight: 700, fontSize: 20, marginBottom: 10 }}>
              Trip Orders and Areas
            </h3>
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 15,
                  background: "#f8fafc",
                  borderRadius: 10,
                  overflow: "hidden",
                }}
              >
                <thead>
                  <tr style={{ background: "#e0e7ef" }}>
                    <th style={{ padding: "10px 8px", fontWeight: 700, color: "#2563eb" }}>Trip</th>
                    <th style={{ padding: "10px 8px", fontWeight: 700, color: "#2563eb" }}>Orders</th>
                    <th style={{ padding: "10px 8px", fontWeight: 700, color: "#2563eb" }}>Areas</th>
                  </tr>
                </thead>
                <tbody>
                  {tripAreaTable.map((row, idx) => (
                    <tr
                      key={row.trip}
                      style={{
                        background: idx % 2 === 0 ? "#fff" : "#f1f5f9",
                        borderBottom: "1px solid #e0e7ef",
                      }}
                    >
                      <td style={{ padding: "8px 8px" }}>{row.trip}</td>
                      <td style={{ padding: "8px 8px" }}>{row.orders}</td>
                      <td style={{ padding: "8px 8px" }}>{row.areas}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Loader animation */}
      {renderPhaseAnimation()}

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
    </div>
  );
};

export default SupplierTripAssignment;
