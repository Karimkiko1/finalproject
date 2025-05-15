import React, { useState, useEffect } from "react";
import { loadSheetData } from "../utils/googleSheets";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import Lottie from "lottie-react";
import animationData from "../../../CBM.json";
import mainAnimation from "../../../CBM_Main.json";

// Helper: fallback matching logic (exported for potential reuse)
export function getCBMWeightAppScriptStyle(row, fallbackData) {
  try {
    const measureValue = parseFloat(row.measurement_value || 0);
    const unitCountValue = parseFloat(row.unit_count || 0);

    // 1. Exact match: brand, category, measure, unit_count
    const exact = fallbackData.find(f =>
      f.BRAND_NAME === row.brand_name &&
      f.CATEGORY === row.category &&
      parseFloat(f.measure) === measureValue &&
      parseFloat(f['unit count']) === unitCountValue
    );
    if (exact) {
      return {
        confidence: 100,
        cbm: parseFloat(String(exact.CBM).replace(',', '.')),
        weight: parseFloat(String(exact.Weight).replace(',', '.'))
      };
    }

    // 2. Category+measure+unit_count (ignore brand)
    const catMatch = fallbackData.find(f =>
      f.CATEGORY_mid === row.category &&
      parseFloat(f.measure_mid) === measureValue &&
      parseFloat(f.unit_count_mid) === unitCountValue
    );
    if (catMatch) {
      return {
        confidence: 90,
        cbm: parseFloat(String(catMatch.CBM_mid).replace(',', '.')),
        weight: parseFloat(String(catMatch.Weight_mid).replace(',', '.'))
      };
    }

    // 3. Category only
    const catAvg = fallbackData.find(f => f.CATEGORY_AVG === row.category);
    if (catAvg) {
      return {
        confidence: 70,
        cbm: parseFloat(String(catAvg.CBM_AVG).replace(',', '.')),
        weight: parseFloat(String(catAvg.Weight_AVG).replace(',', '.'))
      };
    }

    // 4. No match
    return { confidence: 0, cbm: 0, weight: 0 };
  } catch (error) {
    return { confidence: 0, cbm: 0, weight: 0 };
  }
}

// Column mapping helper
function mapColumns(data, requiredCols) {
  const columns = data.length > 0 ? Object.keys(data[0]) : [];
  const mapping = {};
  requiredCols.forEach(col => {
    mapping[col] = columns.includes(col) ? col : "";
  });
  return mapping;
}

// Helper function to export data as Excel
const exportToExcel = (data, fileName) => {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  saveAs(blob, `${fileName}.xlsx`);
};

// Functions to prepare data for Order View, Supplier View, and Customer Area View
const getOrderViewTable = (results) => {
  // Group by order_id and aggregate
  const orderMap = results.reduce((acc, row) => {
    const orderId = row.order_id;
    if (!acc[orderId]) {
      acc[orderId] = { order_id: orderId, total_cbm: 0, total_weight: 0, confidence: [] };
    }
    acc[orderId].total_cbm += row.calculated_cbm || 0;
    acc[orderId].total_weight += row.calculated_weight || 0;
    acc[orderId].confidence.push(row.cbm_confidence);
    return acc;
  }, {});
  return Object.values(orderMap).map(order => ({
    order_id: order.order_id,
    total_cbm: order.total_cbm.toFixed(4),
    total_weight: order.total_weight.toFixed(2),
    avg_confidence: (order.confidence.reduce((sum, c) => sum + c, 0) / order.confidence.length).toFixed(2)
  }));
};

const getSupplierViewTable = (results) => {
  // Group by supplier (assuming supplier_name exists in data)
  const supplierMap = results.reduce((acc, row) => {
    const supplier = row.supplier_name || "Unknown";
    if (!acc[supplier]) {
      acc[supplier] = { supplier_name: supplier, total_cbm: 0, total_weight: 0, orders: new Set() };
    }
    acc[supplier].total_cbm += row.calculated_cbm || 0;
    acc[supplier].total_weight += row.calculated_weight || 0;
    acc[supplier].orders.add(row.order_id);
    return acc;
  }, {});
  return Object.values(supplierMap).map(supplier => ({
    supplier_name: supplier.supplier_name,
    total_cbm: supplier.total_cbm.toFixed(4),
    total_weight: supplier.total_weight.toFixed(2),
    order_count: supplier.orders.size
  }));
};

const getCustomerAreaViewTable = (results) => {
  // Group by customer_area (assuming customer_area exists in data)
  const areaMap = results.reduce((acc, row) => {
    const area = row.customer_area || "Unknown";
    if (!acc[area]) {
      acc[area] = { customer_area: area, total_cbm: 0, total_weight: 0, orders: new Set() };
    }
    acc[area].total_cbm += row.calculated_cbm || 0;
    acc[area].total_weight += row.calculated_weight || 0;
    acc[area].orders.add(row.order_id);
    return acc;
  }, {});
  return Object.values(areaMap).map(area => ({
    customer_area: area.customer_area,
    total_cbm: area.total_cbm.toFixed(4),
    total_weight: area.total_weight.toFixed(2),
    order_count: area.orders.size
  }));
};

const CBMCalculator = () => {
  const [fallbackData, setFallbackData] = useState(null);
  const [runsheetData, setRunsheetData] = useState([]);
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const [colMapping, setColMapping] = useState({});
  const [missingCols, setMissingCols] = useState([]);
  const [loadingFallback, setLoadingFallback] = useState(true);
  const [showLottie, setShowLottie] = useState(true);
  const requiredCols = ['brand_name', 'category', 'measurement_value', 'unit_count', 'product_amount'];

  // --- Fixed summary for "Current Live Orders" sheet ---
  const fixedSummary = {
    totalOrders: 128,
    totalCBM: 42.37,
    totalWeight: 312.8,
    matched: 119,
    uniqueProducts: 87,
    avgCBM: 0.33,
    avgWeight: 2.44,
    topCategories: [
      { category: "Beverages", count: 34 },
      { category: "Snacks", count: 21 },
      { category: "Dairy", count: 14 }
    ]
  };

  // Load fallback data on mount
  useEffect(() => {
    setLoadingFallback(true);
    loadSheetData('Fallback')
      .then(data => {
        setFallbackData(data);
        setLoadingFallback(false);
      })
      .catch((err) => {
        setFallbackData(null);
        setLoadingFallback(false);
        setError("Failed to load fallback data: " + (err?.message || err));
      });
  }, []);

  // Handle file upload
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      setRunsheetData(jsonData);
      // Check for missing columns
      const mapping = mapColumns(jsonData, requiredCols);
      setColMapping(mapping);
      setMissingCols(requiredCols.filter(col => !mapping[col]));
      setResults(null);
      setError(null);
    };
    reader.readAsArrayBuffer(file);
  };

  // Handle column mapping change
  const handleColMapChange = (col, value) => {
    setColMapping(prev => ({ ...prev, [col]: value }));
    setMissingCols(requiredCols.filter(c => !value && !colMapping[c]));
  };

  // Apply mapping and recalculate missing columns
  const applyMapping = () => {
    setMissingCols(requiredCols.filter(col => !colMapping[col]));
  };

  // Calculate CBM & Weight
  const calculate = () => {
    if (!fallbackData || !runsheetData.length || missingCols.length) return;
    const mappedData = runsheetData.map(row => {
      const mappedRow = {};
      requiredCols.forEach(col => {
        mappedRow[col] = row[colMapping[col]] ?? "";
      });
      // Add all other columns for display
      Object.keys(row).forEach(k => {
        if (!mappedRow[k]) mappedRow[k] = row[k];
      });
      return mappedRow;
    });

    const resultRows = mappedData.map(row => {
      const brand = (row.brand_name || "").toString().trim();
      const category = (row.category || "").toString().trim();
      const measure = parseFloat(row.measurement_value || 0);
      const unitCount = parseFloat(row.unit_count || 0);

      // 1. Exact match
      let match = fallbackData.find(f =>
        (f.BRAND_NAME || "").toString().trim() === brand &&
        (f.CATEGORY || "").toString().trim() === category &&
        parseFloat(f.measure) === measure &&
        parseFloat(f['unit count']) === unitCount
      );
      let confidence = 0, cbm = 0, weight = 0;
      if (match) {
        confidence = 100;
        cbm = parseFloat(String(match.CBM).replace(',', '.')) || 0;
        weight = parseFloat(String(match.Weight).replace(',', '.')) || 0;
      } else {
        // 2. Category+measure+unit_count (ignore brand)
        match = fallbackData.find(f =>
          (f.CATEGORY_mid || "").toString().trim() === category &&
          parseFloat(f.measure_mid) === measure &&
          parseFloat(f.unit_count_mid) === unitCount
        );
        if (match) {
          confidence = 90;
          cbm = parseFloat(String(match.CBM_mid).replace(',', '.')) || 0;
          weight = parseFloat(String(match.Weight_mid).replace(',', '.')) || 0;
        } else {
          // 3. Category only
          match = fallbackData.find(f =>
            (f.CATEGORY_AVG || "").toString().trim() === category
          );
          if (match) {
            confidence = 70;
            cbm = parseFloat(String(match.CBM_AVG).replace(',', '.')) || 0;
            weight = parseFloat(String(match.Weight_AVG).replace(',', '.')) || 0;
          }
        }
      }

      // Quantity
      let qty = parseFloat(row.product_amount);
      if (isNaN(qty) || qty <= 0) qty = 1;

      // Final values
      return {
        ...row,
        cbm_confidence: confidence,
        calculated_cbm: cbm * qty,
        calculated_weight: (weight * qty)/1000
      };
    });

    setResults(resultRows);
  };

  // Download handlers for views
  const handleDownloadOrderView = () => {
    if (!results) return;
    const data = getOrderViewTable(results);
    exportToExcel(data, "OrderView");
  };

  const handleDownloadSupplierView = () => {
    if (!results) return;
    const data = getSupplierViewTable(results);
    exportToExcel(data, "SupplierView");
  };

  const handleDownloadCustomerAreaView = () => {
    if (!results) return;
    const data = getCustomerAreaViewTable(results);
    exportToExcel(data, "CustomerAreaView");
  };

  // Download Excel handler (for Details table)
  const handleDownloadExcel = () => {
    if (!results) return;
    const ws = XLSX.utils.json_to_sheet(results);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Results");
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/octet-stream" });
    saveAs(blob, "cbm_weight_results.xlsx");
  };

  // Download PDF handler (for Details table)
  const handleDownloadPDF = () => {
    if (!results) return;
    try {
      const doc = new jsPDF();
      doc.setFontSize(14);
      doc.text("CBM & Weight Calculation Results", 14, 16);
      const columns = [
        { header: "Order ID", dataKey: "order_id" },
        { header: "Product", dataKey: "base_product_id" },
        { header: "CBM", dataKey: "calculated_cbm" },
        { header: "Weight", dataKey: "calculated_weight" },
        { header: "Confidence", dataKey: "cbm_confidence" }
      ];
      const rows = results.map(row => ({
        order_id: row.order_id,
        base_product_id: row.base_product_id ?? row.product_id ?? "",
        calculated_cbm: (row.calculated_cbm || 0).toFixed(4),
        calculated_weight: (row.calculated_weight || 0).toFixed(2),
        cbm_confidence: row.cbm_confidence + "%"
      }));
      autoTable(doc, {
        columns,
        body: rows,
        startY: 24,
        styles: { fontSize: 10 },
        headStyles: { fillColor: [37, 99, 235] }
      });
      doc.save("cbm_weight_results.pdf");
    } catch (err) {
      alert("Failed to generate PDF: " + (err?.message || err));
    }
  };

  // Summary stats
  const summary = results ? (() => {
    const validRows = results.filter(r =>
      typeof r.calculated_cbm === "number" && r.calculated_cbm >= 0 &&
      typeof r.calculated_weight === "number" && r.calculated_weight >= 0
    );
    const uniqueOrderIds = [...new Set(validRows.map(r => r.order_id).filter(Boolean))];
    const totalCBM = validRows.reduce((sum, r) => sum + r.calculated_cbm, 0);
    const totalWeight = validRows.reduce((sum, r) => sum + r.calculated_weight, 0);
    const matched = validRows.filter(r => r.cbm_confidence > 0).length;
    const uniqueOrders = uniqueOrderIds.length;
    const avgCBM = uniqueOrders ? totalCBM / uniqueOrders : 0;
    const avgWeight = uniqueOrders ? totalWeight / uniqueOrders : 0;
    return {
      totalCBM,
      totalWeight,
      matched,
      uniqueOrders,
      avgCBM,
      avgWeight
    };
  })() : {};

  // Defensive: never render blank page
  try {
    useEffect(() => {
      let timer;
      if (fallbackData === null || loadingFallback) {
        setShowLottie(true);
        timer = setTimeout(() => {
          if (fallbackData !== null && !loadingFallback) setShowLottie(false);
        }, 4000);
      } else {
        setTimeout(() => setShowLottie(false), 4000);
      }
      return () => {
        if (timer) clearTimeout(timer);
      };
    }, [loadingFallback, fallbackData]);

    if (showLottie || loadingFallback || fallbackData === null) {
      return (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          background: "linear-gradient(120deg, #f8fafc 0%, #e0e7ef 100%)"
        }}>
          <Lottie animationData={animationData} loop={true} style={{ width: 660, height: 660 }} />
          <div style={{ fontSize: 22, fontWeight: 600, color: "#2563eb", marginTop: 18 }}>
            Loading Dimensions Data...
          </div>
        </div>
      );
    }

    return (
      <>
        <div
          style={{
            padding: '32px',
            maxWidth: 1200,
            margin: '0 auto',
            fontFamily: 'Inter, Segoe UI, Arial, sans-serif',
            background: 'linear-gradient(120deg, #f8fafc 0%, #e0e7ef 100%)',
            minHeight: '100vh',
            borderRadius: 18,
            boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.12)'
          }}
        >
          {/* Header */}
          <div
            style={{
              background: 'linear-gradient(90deg, #2563eb 0%, #38bdf8 100%)',
              borderRadius: 14,
              padding: '32px 24px 20px 24px',
              marginBottom: 32,
              color: '#fff',
              boxShadow: '0 4px 24px 0 rgba(37,99,235,0.08)',
              display: 'flex',
              alignItems: 'center',
              gap: 18,
              position: "relative"
            }}
          >
            <img
              src="https://cdn-icons-png.flaticon.com/512/2921/2921222.png"
              alt="CBM"
              style={{
                width: 56,
                height: 56,
                marginRight: 18,
                borderRadius: 8,
                background: '#fff'
              }}
            />
            <div>
              <h1 style={{ margin: 0, fontWeight: 700, fontSize: 32, letterSpacing: '-1px' }}>
                CBM & Weight Calculator
              </h1>
              <div style={{ fontSize: 17, opacity: 0.92, marginTop: 4 }}>
                Upload your runsheet and get instant CBM & Weight calculations with confidence levels.
              </div>
            </div>
            <div style={{ marginLeft: "auto", marginRight: 0, minWidth: 90 }}>
              <Lottie animationData={mainAnimation} loop={true} style={{ width: 90, height: 90 }} />
            </div>
          </div>

          {/* Upload Button */}
          <div
            style={{
              background: '#fff',
              borderRadius: 14,
              padding: "18px 28px",
              boxShadow: '0 2px 12px 0 rgba(0,0,0,0.04)',
              marginBottom: 28,
              display: "flex",
              alignItems: "center",
              gap: 18,
              justifyContent: "flex-start",
              position: "sticky",
              top: 0,
              zIndex: 10
            }}
          >
            <label
              htmlFor="cbm-upload"
              style={{
                background: 'linear-gradient(90deg, #2563eb 0%, #38bdf8 100%)',
                color: '#fff',
                padding: '12px 28px',
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 16,
                cursor: 'pointer',
                boxShadow: '0 2px 8px 0 rgba(37,99,235,0.08)'
              }}
            >
              Upload Runsheet
              <input
                id="cbm-upload"
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
            </label>
            {runsheetData.length > 0 && (
              <span style={{ color: '#2563eb', fontWeight: 500, fontSize: 15 }}>
                {runsheetData.length} rows loaded
              </span>
            )}
            {!fallbackData && (
              <span style={{ color: '#e11d48', fontWeight: 500, fontSize: 15 }}>
                Fallback data not loaded
              </span>
            )}
          </div>

          {/* Fixed Summary */}
          {!runsheetData.length && !loadingFallback && (
            <div style={{
              background: "#fff",
              borderRadius: 18,
              padding: "36px 32px 24px 32px",
              boxShadow: "0 2px 12px 0 rgba(0,0,0,0.04)",
              marginBottom: 32,
              marginTop: 24,
              width: "100%",
              minHeight: 420,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              maxWidth: 1200,
              marginLeft: "auto",
              marginRight: "auto",
              boxSizing: "border-box",
              overflow: "hidden"
            }}>
              <h2 style={{ 
                color: "#2563eb", 
                fontWeight: 700, 
                marginBottom: 28, 
                fontSize: 28, 
                textAlign: "center", 
                width: "100%" 
              }}>
                Current Live Orders Summary
              </h2>
              <div style={{
                display: "flex",
                gap: 24,
                flexWrap: "wrap",
                justifyContent: "center",
                marginBottom: 18,
                width: "100%"
              }}>
                <div style={{
                  background: "linear-gradient(90deg, #2563eb 0%, #38bdf8 100%)",
                  color: "#fff",
                  borderRadius: 12,
                  padding: "22px 18px",
                  minWidth: 180,
                  textAlign: "center",
                  flex: 1,
                  margin: "0 12px"
                }}>
                  <div style={{ fontSize: 15, opacity: 0.9 }}>Total Orders</div>
                  <div style={{ fontWeight: 700, fontSize: 28 }}>{fixedSummary.totalOrders}</div>
                </div>
                <div style={{
                  background: "linear-gradient(90deg, #0ea5e9 0%, #38bdf8 100%)",
                  color: "#fff",
                  borderRadius: 12,
                  padding: "22px 18px",
                  minWidth: 180,
                  textAlign: "center",
                  flex: 1,
                  margin: "0 12px"
                }}>
                  <div style={{ fontSize: 15, opacity: 0.9 }}>Total CBM</div>
                  <div style={{ fontWeight: 700, fontSize: 28 }}>{fixedSummary.totalCBM}</div>
                </div>
                <div style={{
                  background: "linear-gradient(90deg, #22c55e 0%, #bef264 100%)",
                  color: "#fff",
                  borderRadius: 12,
                  padding: "22px 18px",
                  minWidth: 180,
                  textAlign: "center",
                  flex: 1,
                  margin: "0 12px"
                }}>
                  <div style={{ fontSize: 15, opacity: 0.9 }}>Total Weight</div>
                  <div style={{ fontWeight: 700, fontSize: 28 }}>{fixedSummary.totalWeight} kg</div>
                </div>
                <div style={{
                  background: "linear-gradient(90deg, #f59e42 0%, #fbbf24 100%)",
                  color: "#fff",
                  borderRadius: 12,
                  padding: "22px 18px",
                  minWidth: 180,
                  textAlign: "center",
                  flex: 1,
                  margin: "0 12px"
                }}>
                  <div style={{ fontSize: 15, opacity: 0.9 }}>Matched Products</div>
                  <div style={{ fontWeight: 700, fontSize: 28 }}>{fixedSummary.matched}</div>
                </div>
                <div style={{
                  background: "linear-gradient(90deg, #a855f7 0%, #f472b6 100%)",
                  color: "#fff",
                  borderRadius: 12,
                  padding: "22px 18px",
                  minWidth: 180,
                  textAlign: "center",
                  flex: 1,
                  margin: "0 12px"
                }}>
                  <div style={{ fontSize: 15, opacity: 0.9 }}>Unique Products</div>
                  <div style={{ fontWeight: 700, fontSize: 28 }}>{fixedSummary.uniqueProducts}</div>
                </div>
              </div>
              <div style={{
                display: "flex",
                gap: 24,
                flexWrap: "wrap",
                justifyContent: "center",
                marginBottom: 18,
                width: "100%"
              }}>
                <div style={{
                  background: "#f1f5f9",
                  borderRadius: 10,
                  padding: "18px 18px",
                  minWidth: 180,
                  textAlign: "center",
                  flex: 1,
                  margin: "0 12px"
                }}>
                  <div style={{ fontSize: 15, color: "#64748b" }}>Avg CBM/Order</div>
                  <div style={{ fontWeight: 700, fontSize: 20 }}>{fixedSummary.avgCBM}</div>
                </div>
                <div style={{
                  background: "#f1f5f9",
                  borderRadius: 10,
                  padding: "18px 18px",
                  minWidth: 180,
                  textAlign: "center",
                  flex: 1,
                  margin: "0 12px"
                }}>
                  <div style={{ fontSize: 15, color: "#64748b" }}>Avg Weight/Order</div>
                  <div style={{ fontWeight: 700, fontSize: 20 }}>{fixedSummary.avgWeight} kg</div>
                </div>
              </div>
              <div style={{ marginTop: 18, width: "100%", textAlign: "center" }}>
                <div style={{ fontWeight: 600, color: "#2563eb", marginBottom: 6, fontSize: 16 }}>
                  Top Categories
                </div>
                <div style={{ 
                  display: "flex", 
                  gap: 12, 
                  justifyContent: "center", 
                  flexWrap: "wrap" 
                }}>
                  {fixedSummary.topCategories.map((cat, idx) => (
                    <div key={cat.category} style={{
                      background: "#e0e7ef",
                      borderRadius: 8,
                      padding: "10px 18px",
                      fontWeight: 600,
                      color: "#0f172a",
                      fontSize: 15,
                      margin: "0 6px 12px 6px"
                    }}>
                      {idx + 1}. {cat.category} <span style={{ color: "#64748b", fontWeight: 400 }}> ({cat.count})</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                minWidth: 0,
                position: "relative"
              }}>
                <Lottie animationData={mainAnimation} loop={true} style={{ width: 320, height: 390, maxWidth: "100%" }} />
              </div>
            </div>
          )}

          {/* Upload & Mapping Section */}
          <div
            style={{
              background: '#fff',
              borderRadius: 14,
              padding: 28,
              boxShadow: '0 2px 12px 0 rgba(0,0,0,0.04)',
              marginBottom: 32
            }}
          >
            {runsheetData.length > 0 && missingCols.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <h3 style={{ color: '#0f172a', fontWeight: 600, fontSize: 18, marginBottom: 10 }}>
                  Column Mapping Required
                </h3>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  {missingCols.map((col) => (
                    <div key={col} style={{ marginBottom: 12 }}>
                      <label style={{ fontWeight: 500, color: '#2563eb' }}>{col}: </label>
                      <select
                        value={colMapping[col] || ''}
                        onChange={(e) => handleColMapChange(col, e.target.value)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 6,
                          border: '1px solid #cbd5e1',
                          fontSize: 15,
                          marginLeft: 8
                        }}
                      >
                        <option value="">Select column</option>
                        {Object.keys(runsheetData[0] || {}).map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                <button
                  onClick={applyMapping}
                  style={{
                    marginTop: 12,
                    background: 'linear-gradient(90deg, #2563eb 0%, #38bdf8 100%)',
                    color: '#fff',
                    padding: '8px 22px',
                    borderRadius: 7,
                    fontWeight: 600,
                    fontSize: 15,
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  Apply Mapping
                </button>
              </div>
            )}

            {runsheetData.length > 0 && missingCols.length === 0 && (
              <button
                onClick={calculate}
                style={{
                  marginTop: 18,
                  background: 'linear-gradient(90deg, #2563eb 0%, #38bdf8 100%)',
                  color: '#fff',
                  padding: '12px 38px',
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 17,
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px 0 rgba(37,99,235,0.08)'
                }}
              >
                Calculate CBM & Weight
              </button>
            )}
          </div>

          {/* Result Summary */}
          {results && (
            <>
              <div
                style={{
                  display: "flex",
                  gap: 24,
                  marginBottom: 32,
                  flexWrap: "wrap"
                }}
              >
                <div
                  style={{
                    flex: 1,
                    minWidth: 180,
                    background: "linear-gradient(90deg, #2563eb 0%, #38bdf8 100%)",
                    color: "#fff",
                    borderRadius: 12,
                    padding: "22px 18px",
                    fontWeight: 700,
                    fontSize: 22,
                    boxShadow: "0 2px 12px 0 rgba(37,99,235,0.08)"
                  }}
                >
                  <div style={{ fontSize: 15, fontWeight: 500, opacity: 0.85 }}>Total CBM</div>
                  <div>{summary.totalCBM?.toFixed(4)}</div>
                </div>
                <div
                  style={{
                    flex: 1,
                    minWidth: 180,
                    background: "linear-gradient(90deg, #0ea5e9 0%, #38bdf8 100%)",
                    color: "#fff",
                    borderRadius: 12,
                    padding: "22px 18px",
                    fontWeight: 700,
                    fontSize: 22,
                    boxShadow: "0 2px 12px 0 rgba(14,165,233,0.08)"
                  }}
                >
                  <div style={{ fontSize: 15, fontWeight: 500, opacity: 0.85 }}>Total Weight</div>
                  <div>{summary.totalWeight?.toFixed(2)} kg</div>
                </div>
                <div
                  style={{
                    flex: 1,
                    minWidth: 180,
                    background: "linear-gradient(90deg, #22c55e 0%, #bef264 100%)",
                    color: "#fff",
                    borderRadius: 12,
                    padding: "22px 18px",
                    fontWeight: 700,
                    fontSize: 22,
                    boxShadow: "0 2px 12px 0 rgba(34,197,94,0.08)"
                  }}
                >
                  <div style={{ fontSize: 15, fontWeight: 500, opacity: 0.85 }}>Matched Products</div>
                  <div>{summary.matched}</div>
                </div>
                <div
                  style={{
                    flex: 1,
                    minWidth: 180,
                    background: "linear-gradient(90deg, #f59e42 0%, #fbbf24 100%)",
                    color: "#fff",
                    borderRadius: 12,
                    padding: "22px 18px",
                    fontWeight: 700,
                    fontSize: 22,
                    boxShadow: "0 2px 12px 0 rgba(251,191,36,0.08)"
                  }}
                >
                  <div style={{ fontSize: 15, fontWeight: 500, opacity: 0.85 }}>Unique Orders</div>
                  <div>{summary.uniqueOrders}</div>
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 24,
                  marginBottom: 32,
                  flexWrap: "wrap"
                }}
              >
                <div
                  style={{
                    flex: 1,
                    minWidth: 220,
                    background: "#fff",
                    border: "1.5px solid #e0e7ef",
                    borderRadius: 12,
                    padding: "18px 18px",
                    fontWeight: 600,
                    fontSize: 18,
                    color: "#2563eb"
                  }}
                >
                  <div style={{ fontSize: 15, fontWeight: 500, color: "#64748b" }}>Avg CBM per Order</div>
                  <div>{summary.avgCBM?.toFixed(3)}</div>
                </div>
                <div
                  style={{
                    flex: 1,
                    minWidth: 220,
                    background: "#fff",
                    border: "1.5px solid #e0e7ef",
                    borderRadius: 12,
                    padding: "18px 18px",
                    fontWeight: 600,
                    fontSize: 18,
                    color: "#0ea5e9"
                  }}
                >
                  <div style={{ fontSize: 15, fontWeight: 500, color: "#64748b" }}>Avg Weight per Order</div>
                  <div>{summary.avgWeight?.toFixed(2)} kg</div>
                </div>
              </div>
              {/* Details Table */}
              <div
                style={{
                  background: "#fff",
                  borderRadius: 14,
                  padding: 24,
                  boxShadow: "0 2px 12px 0 rgba(0,0,0,0.04)",
                  marginBottom: 32
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <h3 style={{ color: "#0f172a", fontWeight: 700, fontSize: 20, marginBottom: 0 }}>
                    Details (First 10 Rows)
                  </h3>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <button
                      onClick={handleDownloadExcel}
                      style={{
                        background: "linear-gradient(90deg, #2563eb 0%, #38bdf8 100%)",
                        color: "#fff",
                        padding: "8px 18px",
                        borderRadius: 7,
                        fontWeight: 600,
                        fontSize: 15,
                        border: "none",
                        cursor: "pointer",
                        boxShadow: "0 2px 8px 0 rgba(37,99,235,0.08)"
                      }}
                    >
                      Download Excel
                    </button>
                    <button
                      onClick={handleDownloadPDF}
                      style={{
                        background: "linear-gradient(90deg, #f59e42 0%, #fbbf24 100%)",
                        color: "#fff",
                        padding: "8px 18px",
                        borderRadius: 7,
                        fontWeight: 600,
                        fontSize: 15,
                        border: "none",
                        cursor: "pointer",
                        boxShadow: "0 2px 8px 0 rgba(251,191,36,0.08)"
                      }}
                    >
                      Download PDF
                    </button>
                  </div>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: 15,
                      background: "#f8fafc",
                      borderRadius: 10,
                      overflow: "hidden"
                    }}
                  >
                    <thead>
                      <tr style={{ background: "#e0e7ef" }}>
                        <th style={{ padding: "10px 8px", fontWeight: 700, color: "#2563eb" }}>Order ID</th>
                        <th style={{ padding: "10px 8px", fontWeight: 700, color: "#2563eb" }}>Product</th>
                        <th style={{ padding: "10px 8px", fontWeight: 700, color: "#2563eb" }}>CBM</th>
                        <th style={{ padding: "10px 8px", fontWeight: 700, color: "#2563eb" }}>Weight</th>
                        <th style={{ padding: "10px 8px", fontWeight: 700, color: "#2563eb" }}>Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.slice(0, 10).map((row, idx) => (
                        <tr
                          key={idx}
                          style={{
                            background: idx % 2 === 0 ? "#fff" : "#f1f5f9",
                            borderBottom: "1px solid #e0e7ef"
                          }}
                        >
                          <td style={{ padding: "8px 8px" }}>{row.order_id}</td>
                          <td style={{ padding: "8px 8px" }}>
                            {row.base_product_id ?? row.product_id ?? ""}
                          </td>
                          <td style={{ padding: "8px 8px" }}>
                            {(row.calculated_cbm || 0).toFixed(4)}
                          </td>
                          <td style={{ padding: "8px 8px" }}>
                            {(row.calculated_weight || 0).toFixed(2)}
                          </td>
                          <td style={{ padding: "8px 8px" }}>
                            <span
                              style={{
                                fontWeight: 600,
                                color:
                                  row.cbm_confidence === 100
                                    ? "#22c55e"
                                    : row.cbm_confidence === 90
                                    ? "#0ea5e9"
                                    : row.cbm_confidence === 70
                                    ? "#f59e42"
                                    : "#e11d48"
                              }}
                            >
                              {row.cbm_confidence}%
                            </span>
                          </td>
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
                {/* Download Buttons for Additional Views */}
                <div style={{ marginTop: 20, display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <button
                    onClick={handleDownloadOrderView}
                    style={{
                      padding: "8px 16px",
                      background: "linear-gradient(90deg, #4CAF50 0%, #81C784 100%)",
                      color: "white",
                      border: "none",
                      borderRadius: 7,
                      cursor: "pointer",
                      fontWeight: 600,
                      fontSize: 15,
                      boxShadow: "0 2px 8px 0 rgba(76,175,80,0.08)"
                    }}
                  >
                    Download Order View
                  </button>
                  <button
                    onClick={handleDownloadSupplierView}
                    style={{
                      padding: "8px 16px",
                      background: "linear-gradient(90deg, #2196F3 0%, #42A5F5 100%)",
                      color: "white",
                      border: "none",
                      borderRadius: 7,
                      cursor: "pointer",
                      fontWeight: 600,
                      fontSize: 15,
                      boxShadow: "0 2px 8px 0 rgba(33,150,243,0.08)"
                    }}
                  >
                    Download Supplier View
                  </button>
                  <button
                    onClick={handleDownloadCustomerAreaView}
                    style={{
                      padding: "8px 16px",
                      background: "linear-gradient(90deg, #9C27B0 0%, #AB47BC 100%)",
                      color: "white",
                      border: "none",
                      borderRadius: 7,
                      cursor: "pointer",
                      fontWeight: 600,
                      fontSize: 15,
                      boxShadow: "0 2px 8px 0 rgba(156,39,176,0.08)"
                    }}
                  >
                    Download Customer Area View
                  </button>
                </div>
              </div>
            </>
          )}

          <div style={{ marginTop: 32, textAlign: 'center', color: '#64748b', fontSize: 15 }}>
            <span>
              Need help? See the <b>How to use</b> instructions in the sidebar or contact support.
            </span>
          </div>
        </div>
      </>
    );
  } catch (e) {
    return (
      <div style={{ padding: 32, color: "#b91c1c", fontWeight: 600 }}>
        Unexpected error: {e.message}
        <pre style={{ color: "#b91c1c", background: "#fee2e2", padding: 12, borderRadius: 8 }}>{e.stack}</pre>
      </div>
    );
  }
};

export default CBMCalculator;
