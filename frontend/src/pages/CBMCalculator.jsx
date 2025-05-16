import React, { useState, useEffect } from "react";
import { loadSheetData } from "../utils/googleSheets";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import Lottie from "lottie-react";
import animationData from "../../../CBM.json";
import mainAnimation from "../../../CBM_Main.json";
import { utils as XLSXUtils, writeFile as XLSXWriteFile } from "xlsx";
import { updateSheetValues } from "../services/googleSheets";
import IntroJs from 'intro.js';
import 'intro.js/minified/introjs.min.css';

const RUNSHEET_SUMMARY_KEY = 'cbm_runsheet_summary';

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

// Helper for GMV (Gross Merchandise Value) calculation
function getGMV(row) {
  if (row.total_price) return parseFloat(row.total_price) || 0;
  if (row.price) return parseFloat(row.price) || 0;
  if (row.gmv) return parseFloat(row.gmv) || 0;
  if (row.total_weight) return parseFloat(row.total_weight) * 100;
  return 0;
}

// Helper to calculate median
function getMedian(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// --- Table Aggregation Logic ---
function getOrderViewTable(data) {
  const grouped = {};
  data.forEach(row => {
    const order_id = row.order_id || "N/A";
    if (!grouped[order_id]) {
      grouped[order_id] = {
        supplier_name: row.supplier_name || "",
        order_id,
        product_count: 0,
        total_cbm: 0,
        total_weight: 0,
        total_gmv: 0
      };
    }
    grouped[order_id].product_count += 1;
    grouped[order_id].total_cbm += parseFloat(row.calculated_cbm) || 0;
    grouped[order_id].total_weight += parseFloat(row.calculated_weight) || 0;
    grouped[order_id].total_gmv += row.total_gmv !== undefined ? parseFloat(row.total_gmv) || 0 : getGMV(row);
  });
  return Object.values(grouped);
}

function getSupplierViewTable(data) {
  const grouped = {};
  data.forEach(row => {
    const supplier = row.supplier_name || "N/A";
    if (!grouped[supplier]) {
      grouped[supplier] = {
        supplier_name: supplier,
        order_set: new Set(),
        product_count: 0,
        total_cbm: 0,
        total_weight: 0,
        total_gmv: 0
      };
    }
    grouped[supplier].order_set.add(row.order_id);
    grouped[supplier].product_count += 1;
    grouped[supplier].total_cbm += parseFloat(row.calculated_cbm) || 0;
    grouped[supplier].total_weight += parseFloat(row.calculated_weight) || 0;
    grouped[supplier].total_gmv += row.total_gmv !== undefined ? parseFloat(row.total_gmv) || 0 : getGMV(row);
  });
  return Object.values(grouped).map(g => ({
    ...g,
    order_count: g.order_set.size
  }));
}

function getCustomerAreaViewTable(data) {
  const grouped = {};
  data.forEach(row => {
    const supplier = row.supplier_name || "";
    const area = row.customer_area || "";
    if (!grouped[supplier]) grouped[supplier] = {};
    if (!grouped[supplier][area]) {
      grouped[supplier][area] = {
        supplier_name: supplier,
        customer_area: area,
        retailer_set: new Set(),
        order_set: new Set(),
        total_cbm: 0,
        total_weight: 0,
        total_gmv: 0
      };
    }
    grouped[supplier][area].retailer_set.add(row.retailer || row.retailer_name || "");
    grouped[supplier][area].order_set.add(row.order_id);
    grouped[supplier][area].total_cbm += parseFloat(row.calculated_cbm) || 0;
    grouped[supplier][area].total_weight += parseFloat(row.calculated_weight) || 0;
    grouped[supplier][area].total_gmv += row.total_gmv !== undefined
      ? parseFloat(row.total_gmv) || 0
      : getGMV(row);
  });
  const rows = [];
  Object.keys(grouped).forEach(supplier => {
    const areas = Object.values(grouped[supplier]);
    areas.forEach((areaObj, idx) => {
      rows.push({
        supplier_name: idx === 0 ? supplier : "",
        customer_area: areaObj.customer_area,
        retailer_count: areaObj.retailer_set.size,
        order_count: areaObj.order_set.size,
        total_cbm: areaObj.total_cbm,
        total_weight: areaObj.total_weight,
        total_gmv: areaObj.total_gmv
      });
    });
  });
  return rows;
}

// Download helper for a table
function downloadTableAsExcel(tableData, columns, filename) {
  if (!tableData || !tableData.length) return;
  const exportData = tableData.map(row => {
    const obj = {};
    columns.forEach(col => {
      obj[col.label] = typeof row[col.key] === "number"
        ? row[col.key].toFixed(col.fixed || 0)
        : row[col.key];
    });
    return obj;
  });
  const ws = XLSXUtils.json_to_sheet(exportData);
  const wb = XLSXUtils.book_new();
  XLSXUtils.book_append_sheet(wb, ws, "Sheet1");
  XLSXWriteFile(wb, filename);
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

const CBMCalculator = () => {
  const [fallbackData, setFallbackData] = useState(null);
  const [runsheetData, setRunsheetData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const [colMapping, setColMapping] = useState({});
  const [missingCols, setMissingCols] = useState([]);
  const [loadingFallback, setLoadingFallback] = useState(true);
  const [showLottie, setShowLottie] = useState(true);
  const [suppliers, setSuppliers] = useState([]);
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const requiredCols = ['brand_name', 'category', 'measurement_value', 'unit_count', 'product_amount'];
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(null);

  // Top summary state
  const [fixedSummary, setFixedSummary] = useState(() => {
    const saved = localStorage.getItem(RUNSHEET_SUMMARY_KEY);
    return saved ? JSON.parse(saved) : {
      totalOrders: 0,
      totalCBM: 0,
      totalWeight: 0,
      medianConfidence: 0,
      uniqueProducts: 0,
      avgCBM: 0,
      avgWeight: 0,
      topCategories: []
    };
  });

  // Load runsheet and fallback data, and extract suppliers
  useEffect(() => {
    setLoadingFallback(true);
    Promise.all([
      loadSheetData('Runsheet'),
      loadSheetData('Fallback')
    ])
      .then(([runsheet, fallback]) => {
        setRunsheetData(runsheet);
        setFilteredData(runsheet);
        setFallbackData(fallback);
        // Extract unique supplier names
        const uniqueSuppliers = [...new Set(runsheet.map(row => row.supplier_name).filter(Boolean))].sort();
        setSuppliers(uniqueSuppliers);
        setLoadingFallback(false);
        // Set column mapping
        const mapping = mapColumns(runsheet, requiredCols);
        setColMapping(mapping);
        setMissingCols(requiredCols.filter(col => !mapping[col]));
      })
      .catch(err => {
        setFallbackData(null);
        setLoadingFallback(false);
        setError("Failed to load data: " + (err?.message || err));
      });
  }, []);

  // Show Lottie animation for at least 4 seconds AND until data is loaded
  useEffect(() => {
    let timer;
    if (fallbackData === null || loadingFallback) {
      setShowLottie(true);
      timer = setTimeout(() => {
        if (fallbackData !== null && !loadingFallback) setShowLottie(false);
      }, 2000);
    } else {
      setTimeout(() => setShowLottie(false), 2000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [loadingFallback, fallbackData]);

  // Handle supplier selection
  useEffect(() => {
    if (selectedSupplier) {
      const filtered = runsheetData.filter(row => row.supplier_name === selectedSupplier);
      setFilteredData(filtered);
      const mapping = mapColumns(filtered, requiredCols);
      setColMapping(mapping);
      setMissingCols(requiredCols.filter(col => !mapping[col]));
      // Do NOT setResults(null) here; keep previous results so tables persist
    } else {
      setFilteredData(runsheetData);
      const mapping = mapColumns(runsheetData, requiredCols);
      setColMapping(mapping);
      setMissingCols(requiredCols.filter(col => !mapping[col]));
      // Do NOT setResults(null) here; keep previous results so tables persist
    }
  }, [selectedSupplier, runsheetData]);

  // Handle column mapping change
  const handleColMapChange = (col, value) => {
    setColMapping(prev => ({ ...prev, [col]: value }));
    setMissingCols(requiredCols.filter(c => !value && !colMapping[c]));
  };

  // Apply mapping and recalculate missing columns
  const applyMapping = () => {
    setMissingCols(requiredCols.filter(col => !colMapping[col]));
  };

  // Update results and summary instantly when supplier changes (if results exist)
  useEffect(() => {
    if (!results) return;
    // Filter results for selected supplier
    const filtered = selectedSupplier
      ? results.filter(row => row.supplier_name === selectedSupplier)
      : results;
    // Update summary for filtered results
    const headers = Object.keys(filtered[0] || {});
    const orderIdCol = headers.find(k => k.toLowerCase().includes('order')) || 'order_id';
    const productIdCol = headers.find(k => k.toLowerCase().includes('product')) || 'product_id';
    const categoryCol = headers.find(k => k.toLowerCase().includes('category')) || 'category';
    const totalCBM = filtered.reduce((sum, r) => sum + (parseFloat(r.calculated_cbm) || 0), 0);
    const totalWeight = filtered.reduce((sum, r) => sum + (parseFloat(r.calculated_weight) || 0), 0);
    const totalOrders = new Set(filtered.map(r => r[orderIdCol])).size;
    const uniqueProducts = new Set(filtered.map(r => r[productIdCol])).size;
    // Median confidence calculation
    const confidences = filtered.map(r => r.cbm_confidence).filter(v => typeof v === 'number');
    const medianConfidence = getMedian(confidences);
    const avgCBM = totalOrders ? totalCBM / totalOrders : 0;
    const avgWeight = totalOrders ? totalWeight / totalOrders : 0;
    const topCategories = Object.entries(
      filtered.reduce((acc, r) => {
        const cat = r[categoryCol] || 'Unknown';
        acc[cat] = (acc[cat] || 0) + 1;
        return acc;
      }, {})
    )
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([category, count]) => ({ category, count }));
    const summary = {
      totalOrders,
      totalCBM,
      totalWeight,
      medianConfidence,
      uniqueProducts,
      avgCBM,
      avgWeight,
      topCategories
    };
    setFixedSummary(summary);
    localStorage.setItem(RUNSHEET_SUMMARY_KEY, JSON.stringify(summary));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSupplier, results]);

  // Download Excel handler
  const handleDownloadExcel = () => {
    if (!results) return;
    const ws = XLSX.utils.json_to_sheet(results);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Results");
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/octet-stream" });
    saveAs(blob, "cbm_weight_results.xlsx");
  };

  // Download PDF handler
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

  // Refresh handler
  const handleRefreshCBM = async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const [runsheet, fallback] = await Promise.all([
        loadSheetData("Runsheet"),
        loadSheetData("Fallback")
      ]);
      setRunsheetData(runsheet);
      setFilteredData(selectedSupplier ? runsheet.filter(row => row.supplier_name === selectedSupplier) : runsheet);
      const uniqueSuppliers = [...new Set(runsheet.map(row => row.supplier_name).filter(Boolean))].sort();
      setSuppliers(uniqueSuppliers);
      // Map columns for the current filtered data
      const mapping = mapColumns(selectedSupplier ? runsheet.filter(row => row.supplier_name === selectedSupplier) : runsheet, requiredCols);
      setColMapping(mapping);
      setMissingCols(requiredCols.filter(col => !mapping[col]));
      // Only proceed if all required columns are mapped
      if (requiredCols.some(col => !mapping[col])) {
        // Do NOT setResults(null) here; keep previous results so tables persist
        setRefreshing(false);
        return;
      }
      // Map columns for calculation
      const mappedData = (selectedSupplier ? runsheet.filter(row => row.supplier_name === selectedSupplier) : runsheet).map(row => {
        const mappedRow = {};
        requiredCols.forEach(col => {
          mappedRow[col] = row[mapping[col]] ?? "";
        });
        Object.keys(row).forEach(k => {
          if (!mappedRow[k]) mappedRow[k] = row[k];
        });
        return mappedRow;
      });
      // Calculate CBM/Weight/confidence
      const resultRows = mappedData.map(row => {
        const cbmWeight = getCBMWeightAppScriptStyle(row, fallback);
        let qty = parseFloat(row.product_amount);
        if (isNaN(qty) || qty <= 0) qty = 1;
        return {
          ...row,
          cbm_confidence: cbmWeight.confidence,
          calculated_cbm: cbmWeight.cbm * qty,
          calculated_weight: (cbmWeight.weight * qty) / 1000
        };
      });
      setResults(resultRows);
      // Update summary
      const headers = Object.keys(resultRows[0] || {});
      const orderIdCol = headers.find(k => k.toLowerCase().includes('order')) || 'order_id';
      const productIdCol = headers.find(k => k.toLowerCase().includes('product')) || 'product_id';
      const categoryCol = headers.find(k => k.toLowerCase().includes('category')) || 'category';
      const totalCBM = resultRows.reduce((sum, r) => sum + (parseFloat(r.calculated_cbm) || 0), 0);
      const totalWeight = resultRows.reduce((sum, r) => sum + (parseFloat(r.calculated_weight) || 0), 0);
      const totalOrders = new Set(resultRows.map(r => r[orderIdCol])).size;
      const uniqueProducts = new Set(resultRows.map(r => r[productIdCol])).size;
      // Median confidence calculation
      const confidences = resultRows.map(r => r.cbm_confidence).filter(v => typeof v === 'number');
      const medianConfidence = getMedian(confidences);
      const avgCBM = totalOrders ? totalCBM / totalOrders : 0;
      const avgWeight = totalOrders ? totalWeight / totalOrders : 0;
      const topCategories = Object.entries(
        resultRows.reduce((acc, r) => {
          const cat = r[categoryCol] || 'Unknown';
          acc[cat] = (acc[cat] || 0) + 1;
          return acc;
        }, {})
      )
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([category, count]) => ({ category, count }));
      const summary = {
        totalOrders,
        totalCBM,
        totalWeight,
        medianConfidence,
        uniqueProducts,
        avgCBM,
        avgWeight,
        topCategories
      };
      setFixedSummary(summary);
      localStorage.setItem(RUNSHEET_SUMMARY_KEY, JSON.stringify(summary));
      setRefreshing(false);
    } catch (err) {
      setRefreshError("Failed to refresh CBM/Weight: " + (err?.message || err));
      setRefreshing(false);
    }
  };

  // Add a helper to start the tour in Arabic
  const startTour = () => {
    IntroJs().setOptions({
      steps: [
        {
          element: document.querySelector('h1'),
          intro: 'مرحبًا بك في لوحة تحكم حساب الأبعاد والأوزان!'
        },
        {
          element: document.querySelector('button[onClick="handleRefreshCBM"]'),
          intro: 'اضغط هنا لتحديث بيانات الأبعاد والأوزان.'
        },
        {
          element: document.querySelector('select'),
          intro: 'اختر المورد لعرض بياناته فقط.'
        },
        {
          element: document.querySelector('div[style*="Summary Section"]'),
          intro: 'هنا ملخص الطلبات، الأبعاد، الأوزان، والثقة.'
        },
        {
          element: document.querySelector('div[style*="Mapping and Calculation Section"]'),
          intro: 'قم بتعيين الأعمدة المطلوبة إذا لم تتطابق تلقائيًا.'
        },
        {
          element: document.querySelector('div[style*="Details (First 10 Rows)"] button'),
          intro: 'يمكنك تحميل النتائج كملف Excel أو PDF من هنا.'
        },
        {
          element: document.querySelector('div[style*="Order View Table"] button'),
          intro: 'اضغط هنا لتحميل ملخص الطلبات.'
        },
        {
          element: document.querySelector('div[style*="Supplier View Table"] button'),
          intro: 'اضغط هنا لتحميل ملخص الموردين.'
        },
        {
          element: document.querySelector('div[style*="Customer Area View Table"] button'),
          intro: 'اضغط هنا لتحميل ملخص المناطق.'
        },
        {
          element: document.querySelector('div[style*="Footer Note"]'),
          intro: 'للمساعدة أو الدعم، راجع التعليمات أو تواصل مع الدعم الفني.'
        }
      ],
      showProgress: true,
      showBullets: false,
      exitOnOverlayClick: true,
      highlightClass: 'introjs-custom-highlight',
      overlayOpacity: 0.6,
      nextLabel: 'التالي',
      prevLabel: 'السابق',
      doneLabel: 'إنهاء'
    }).start();
  };

  // Custom highlight style for Intro.js
  // Add this style to the page
  React.useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      .introjs-custom-highlight {
        box-shadow: 0 0 0 4px #2563eb, 0 0 0 100vw rgba(0,0,0,0.18);
        border-radius: 12px !important;
        z-index: 99999 !important;
      }
      .introjs-overlay {
        background: rgba(0,0,0,0.6) !important;
      }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  // Defensive rendering
  try {
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
          <Lottie animationData={mainAnimation} loop={true} style={{ width: 660, height: 660 }} />
          <div style={{ fontSize: 22, fontWeight: 600, color: "#2563eb", marginTop: 18 }}>
            Loading Dimensions Data...
          </div>
        </div>
      );
    }

    return (
      <div style={{
        padding: '32px',
        margin: 0,
        fontFamily: 'Inter, Segoe UI, Arial, sans-serif',
        background: 'linear-gradient(120deg, #f8fafc 0%, #e0e7ef 100%)',
        minHeight: '100vh',
        borderRadius: 18,
        boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.12)'
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(90deg, #2563eb 0%, #38bdf8 100%)',
          borderRadius: 14,
          padding: '36px 28px 24px 28px',
          marginBottom: 32,
          color: '#fff',
          boxShadow: '0 4px 24px 0 rgba(37,99,235,0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          position: "relative"
        }}>
          <img
            src="https://cdn-icons-png.flaticon.com/512/2921/2921222.png"
            alt="CBM"
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
              Weights &amp; Dimensions Overview
            </h1>
            <div style={{
              fontSize: 21,
              opacity: 0.96,
              marginTop: 6,
              fontWeight: 500,
              letterSpacing: '-0.5px'
            }}>
              Update. Select. Download. <span style={{ color: "#fbbf24", fontWeight: 700 }}>That's it!</span>
            </div>
            <div style={{
              marginTop: 10,
              fontSize: 15,
              color: "#e0e7ef",
              fontWeight: 400,
              letterSpacing: 0,
              opacity: 0.92
            }}>
            </div>
          </div>
          <div style={{
            position: "absolute",
            right: 28,
            top: 24,
            display: "flex",
            alignItems: "center",
            gap: 10
          }}>
            <a
              href="Start-Onboarding"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "#fff",
                background: "rgba(37,99,235,0.18)",
                borderRadius: 7,
                padding: "7px 16px",
                fontWeight: 600,
                fontSize: 15,
                textDecoration: "none",
                transition: "background 0.2s"
              }}
            >
              Need Help?
            </a>
            <a
              href="mailto:karem.said@cartona.com"
              style={{
                color: "#fff",
                background: "rgba(251,191,36,0.18)",
                borderRadius: 7,
                padding: "7px 16px",
                fontWeight: 600,
                fontSize: 15,
                textDecoration: "none",
                transition: "background 0.2s"
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
        {/* Controls */}
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            padding: "26px 36px",
            boxShadow: "0 4px 24px 0 rgba(37,99,235,0.07)",
            marginBottom: 32,
            display: "flex",
            alignItems: "center",
            gap: 24,
            justifyContent: "space-between",
            position: "sticky",
            top: 0,
            zIndex: 10,
            minHeight: 72,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <a
              href="https://redash.cartona.com/queries/22442"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: "linear-gradient(90deg, #2563eb 0%, #38bdf8 100%)",
                color: "#fff",
                padding: "12px 28px",
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 18,
                textDecoration: "none",
                boxShadow: "0 2px 8px 0 rgba(34,197,94,0.08)",
                transition: "box-shadow 0.2s, transform 0.2s",
                border: "none",
                outline: "none",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              Query Link
            </a>
            <button
              onClick={handleRefreshCBM}
              disabled={refreshing}
              style={{
                background: refreshing
                  ? "linear-gradient(90deg, #cbd5e1 0%, #e0e7ef 100%)"
                  : "linear-gradient(90deg, #2563eb 0%, #38bdf8 100%)",
                color: "#fff",
                padding: "12px 28px",
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 18,
                border: "none",
                cursor: refreshing ? "not-allowed" : "pointer",
                boxShadow: "0 2px 8px 0 rgba(37,99,235,0.08)",
                transition: "box-shadow 0.2s, transform 0.2s",
                outline: "none",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {refreshing ? "Refreshing…" : "Update Data"}
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <select
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
              style={{
                padding: "12px 28px",
                borderRadius: 8,
                border: "1.5px solid #cbd5e1",
                fontSize: 18,
                background: "#f8fafc",
                color: "#2563eb",
                fontWeight: 600,
                cursor: "pointer",
                minWidth: 220,
                outline: "none",
                boxShadow: "0 1px 4px 0 rgba(37,99,235,0.04)",
                transition: "border 0.2s",
              }}
            >
              <option value="">All Suppliers</option>
              {suppliers.map((supplier) => (
                <option key={supplier} value={supplier}>
                  {supplier}
                </option>
              ))}
            </select>
            {filteredData.length > 0 && (
              <span
                style={{
                  color: "#2563eb",
                  fontWeight: 500,
                  fontSize: 17,
                  background: "#f1f5f9",
                  borderRadius: 7,
                  padding: "7px 16px",
                  marginLeft: 4,
                }}
              >
                {filteredData.length} rows loaded
              </span>
            )}
            {!fallbackData && (
              <span
                style={{
                  color: "#e11d48",
                  fontWeight: 500,
                  fontSize: 17,
                  background: "#fee2e2",
                  borderRadius: 7,
                  padding: "7px 16px",
                  marginLeft: 4,
                }}
              >
                Fallback data not loaded
              </span>
            )}
          </div>
        </div>
        <style>
        {`
        @keyframes spin {
          0% { transform: rotate(0deg);}
          100% { transform: rotate(360deg);}
        }
        `}
        </style>
        {/* Summary Section */}
        <div style={{
          background: "#fff",
          borderRadius: 18,
          padding: "40px 36px 28px 36px",
          boxShadow: "0 2px 12px 0 rgba(0,0,0,0.04)",
          width: "100%",
          minHeight: 420,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          margin: 0,
          margin: 0,
          boxSizing: "border-box",
          overflow: "hidden"
        }}>
          <h2 style={{ 
            color: "#2563eb", 
            fontWeight: 700, 
            marginBottom: 32, 
            fontSize: 32, 
            textAlign: "center", 
            width: "100%" 
          }}>
            {selectedSupplier ? `${selectedSupplier} Summary` : 'Current Live Orders Summary'}
          </h2>
          <div style={{
            display: "flex",
            gap: 32,
            flexWrap: "wrap",
            justifyContent: "center",
            marginBottom: 24,
            width: "100%"
          }}>
            <div style={{
              background: "linear-gradient(90deg, #2563eb 0%, #38bdf8 100%)",
              color: "#fff",
              borderRadius: 12,
              padding: "28px 22px",
              minWidth: 200,
              textAlign: "center",
              flex: 1,
              margin: "0 16px",
              fontSize: 22
            }}>
              <div style={{ fontSize: 18, opacity: 0.9 }}>Total Orders</div>
              <div style={{ fontWeight: 700, fontSize: 32 }}>{fixedSummary.totalOrders ?? 0}</div>
            </div>
            <div style={{
              background: "linear-gradient(90deg, #2563eb 0%, #38bdf8 100%)",
              color: "#fff",
              borderRadius: 12,
              padding: "28px 22px",
              minWidth: 200,
              textAlign: "center",
              flex: 1,
              margin: "0 16px",
              fontSize: 22
            }}>
              <div style={{ fontSize: 18, opacity: 0.9 }}>Total CBM</div>
              <div style={{ fontWeight: 700, fontSize: 32 }}>{fixedSummary.totalCBM?.toFixed(2) ?? 0}</div>
            </div>
            <div style={{
              background: "linear-gradient(90deg, #2563eb 0%, #38bdf8 100%)",
              color: "#fff",
              borderRadius: 12,
              padding: "28px 22px",
              minWidth: 200,
              textAlign: "center",
              flex: 1,
              margin: "0 16px",
              fontSize: 22
            }}>
              <div style={{ fontSize: 18, opacity: 0.9 }}>Total Weight</div>
              <div style={{ fontWeight: 700, fontSize: 32 }}>{fixedSummary.totalWeight?.toFixed(2) ?? 0} kg</div>
            </div>
            <div style={{
              background: "linear-gradient(90deg, #f59e42 0%, #fbbf24 100%)",
              color: "#fff",
              borderRadius: 12,
              padding: "28px 22px",
              minWidth: 200,
              textAlign: "center",
              flex: 1,
              margin: "0 16px",
              fontSize: 22
            }}>
              <div style={{ fontSize: 18, opacity: 0.9 }}>Median Confidence</div>
              <div style={{ fontWeight: 700, fontSize: 32 }}>{fixedSummary.medianConfidence ?? 0}%</div>
            </div>
            <div style={{
              background: "linear-gradient(90deg, #2563eb 0%, #38bdf8 100%)",
              color: "#fff",
              borderRadius: 12,
              padding: "28px 22px",
              minWidth: 200,
              textAlign: "center",
              flex: 1,
              margin: "0 16px",
              fontSize: 22
            }}>
              <div style={{ fontSize: 18, opacity: 0.9 }}>Unique Products</div>
              <div style={{ fontWeight: 700, fontSize: 32 }}>{fixedSummary.uniqueProducts ?? 0}</div>
            </div>
          </div>
          <div style={{
            display: "flex",
            gap: 32,
            flexWrap: "wrap",
            justifyContent: "center",
            marginBottom: 24,
            width: "100%"
          }}>
            <div style={{
              background: "#f1f5f9",
              borderRadius: 10,
              padding: "22px 22px",
              minWidth: 200,
              textAlign: "center",
              flex: 1,
              margin: "0 16px",
              fontSize: 20
            }}>
              <div style={{ fontSize: 17, color: "#64748b" }}>Avg CBM/Order</div>
              <div style={{ fontWeight: 700, fontSize: 24 }}>{fixedSummary.avgCBM?.toFixed(3) ?? 0}</div>
            </div>
            <div style={{
              background: "#f1f5f9",
              borderRadius: 10,
              padding: "22px 22px",
              minWidth: 200,
              textAlign: "center",
              flex: 1,
              margin: "0 16px",
              fontSize: 20
            }}>
              <div style={{ fontSize: 17, color: "#64748b" }}>Avg Weight/Order</div>
              <div style={{ fontWeight: 700, fontSize: 24 }}>{fixedSummary.avgWeight?.toFixed(2) ?? 0} kg</div>
            </div>
          </div>
          {fixedSummary.topCategories && (
            <div style={{ marginTop: 18, width: "100%", textAlign: "center" }}>
              <div style={{ fontWeight: 600, color: "#2563eb", marginBottom: 8, fontSize: 20 }}>
                Top Categories
              </div>
              <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
                {fixedSummary.topCategories.map((cat, idx) => (
                  <div key={cat.category} style={{
                    background: "#e0e7ef",
                    borderRadius: 8,
                    padding: "12px 22px",
                    fontWeight: 600,
                    color: "#0f172a",
                    fontSize: 18,
                    margin: "0 8px 12px 8px"
                  }}>
                    {idx + 1}. {cat.category} <span style={{ color: "#64748b", fontWeight: 400 }}> ({cat.count})</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            minWidth: 0,
            position: "relative"
          }}>
          </div>
        </div>

        {/* Mapping and Calculation Section */}
        <div style={{
          background: '#fff',
          borderRadius: 14,
          padding: 28,
          boxShadow: '0 2px 12px 0 rgba(0,0,0,0.04)',
          marginBottom: 32
        }}>
          {filteredData.length > 0 && missingCols.length > 0 && (
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
                      {Object.keys(filteredData[0] || {}).map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
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
        </div>

        {/* Results Section */}
        {results && (
          <>
            {/* Details Table */}
            <div style={{
              background: "#fff",
              borderRadius: 14,
              padding: 24,
              boxShadow: "0 2px 12px 0 rgba(0,0,0,0.04)",
              marginBottom: 32
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <h3 style={{ color: "#0f172a", fontWeight: 700, fontSize: 20, marginBottom: 0 }}>
                  Details (First 10 Rows)
                </h3>
                <div style={{ display: "flex", gap: 12 }}>
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
                <table style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 15,
                  background: "#f8fafc",
                  borderRadius: 10,
                  overflow: "hidden"
                }}>
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
                      <tr key={idx} style={{
                        background: idx % 2 === 0 ? "#fff" : "#f1f5f9",
                        borderBottom: "1px solid #e0e7ef"
                      }}>
                        <td style={{ padding: "8px 8px" }}>{row.order_id}</td>
                        <td style={{ padding: "8px 8px" }}>{row.base_product_id ?? row.product_id ?? ""}</td>
                        <td style={{ padding: "8px 8px" }}>{(row.calculated_cbm || 0).toFixed(4)}</td>
                        <td style={{ padding: "8px 8px" }}>{(row.calculated_weight || 0).toFixed(2)}</td>
                        <td style={{ padding: "8px 8px" }}>
                          <span style={{
                            fontWeight: 600,
                            color: row.cbm_confidence === 100 ? "#22c55e" :
                                  row.cbm_confidence === 90 ? "#0ea5e9" :
                                  row.cbm_confidence === 70 ? "#f59e42" : "#e11d48"
                          }}>
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
            </div>

            {/* Order View Table */}
            <div style={{ background: "#fff", borderRadius: 14, padding: 24, boxShadow: "0 2px 12px 0 rgba(0,0,0,0.04)", marginBottom: 32 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <h3 style={{ color: "#0f172a", fontWeight: 700, fontSize: 20, marginBottom: 0 }}>
                  Order View
                </h3>
                <button
                  onClick={() => downloadTableAsExcel(
                    getOrderViewTable(results),
                    [
                      { key: "supplier_name", label: "Supplier" },
                      { key: "order_id", label: "Order ID" },
                      { key: "product_count", label: "Product Count" },
                      { key: "total_cbm", label: "Total CBM", fixed: 4 },
                      { key: "total_weight", label: "Total Weight", fixed: 2 },
                      { key: "total_gmv", label: "Total GMV", fixed: 2 }
                    ],
                    "order_view.xlsx"
                  )}
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
                  Download Sheet
                </button>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15, background: "#f8fafc", borderRadius: 10, overflow: "hidden" }}>
                  <thead>
                    <tr style={{ background: "#e0e7ef" }}>
                      <th style={{ padding: "10px 8px" }}>Supplier</th>
                      <th style={{ padding: "10px 8px" }}>Order ID</th>
                      <th style={{ padding: "10px 8px" }}>Product Count</th>
                      <th style={{ padding: "10px 8px" }}>Total CBM</th>
                      <th style={{ padding: "10px 8px" }}>Total Weight</th>
                      <th style={{ padding: "10px 8px" }}>Total GMV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getOrderViewTable(results).slice(0, 15).map((row, idx) => (
                      <tr key={idx} style={{ background: idx % 2 === 0 ? "#fff" : "#f1f5f9" }}>
                        <td style={{ padding: "8px 8px" }}>{row.supplier_name}</td>
                        <td style={{ padding: "8px 8px" }}>{row.order_id}</td>
                        <td style={{ padding: "8px 8px" }}>{row.product_count}</td>
                        <td style={{ padding: "8px 8px" }}>{row.total_cbm.toFixed(4)}</td>
                        <td style={{ padding: "8px 8px" }}>{row.total_weight.toFixed(2)}</td>
                        <td style={{ padding: "8px 8px" }}>{row.total_gmv.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {getOrderViewTable(results).length > 15 && (
                  <div style={{ color: "#64748b", fontSize: 14, marginTop: 8 }}>
                    Showing first 15 rows. Download for full data.
                  </div>
                )}
              </div>
            </div>

            {/* Supplier View Table */}
            <div style={{ background: "#fff", borderRadius: 14, padding: 24, boxShadow: "0 2px 12px 0 rgba(0,0,0,0.04)", marginBottom: 32 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <h3 style={{ color: "#0f172a", fontWeight: 700, fontSize: 20, marginBottom: 0 }}>
                  Supplier View
                </h3>
                <button
                  onClick={() => downloadTableAsExcel(
                    getSupplierViewTable(results),
                    [
                      { key: "supplier_name", label: "Supplier" },
                      { key: "order_count", label: "Order Count" },
                      { key: "product_count", label: "Product Count" },
                      { key: "total_cbm", label: "Total CBM", fixed: 4 },
                      { key: "total_weight", label: "Total Weight", fixed: 2 },
                      { key: "total_gmv", label: "Total GMV", fixed: 2 }
                    ],
                    "supplier_view.xlsx"
                  )}
                  style={{
                    background: "linear-gradient(90deg, #0ea5e9 0%, #38bdf8 100%)",
                    color: "#fff",
                    padding: "8px 18px",
                    borderRadius: 7,
                    fontWeight: 600,
                    fontSize: 15,
                    border: "none",
                    cursor: "pointer",
                    boxShadow: "0 2px 8px 0 rgba(14,165,233,0.08)"
                  }}
                >
                  Download Sheet
                </button>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15, background: "#f8fafc", borderRadius: 10, overflow: "hidden" }}>
                  <thead>
                    <tr style={{ background: "#e0e7ef" }}>
                      <th style={{ padding: "10px 8px" }}>Supplier</th>
                      <th style={{ padding: "10px 8px" }}>Order Count</th>
                      <th style={{ padding: "10px 8px" }}>Product Count</th>
                      <th style={{ padding: "10px 8px" }}>Total CBM</th>
                      <th style={{ padding: "10px 8px" }}>Total Weight</th>
                      <th style={{ padding: "10px 8px" }}>Total GMV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getSupplierViewTable(results).slice(0, 15).map((row, idx) => (
                      <tr key={idx} style={{ background: idx % 2 === 0 ? "#fff" : "#f1f5f9" }}>
                        <td style={{ padding: "8px 8px" }}>{row.supplier_name}</td>
                        <td style={{ padding: "8px 8px" }}>{row.order_count}</td>
                        <td style={{ padding: "8px 8px" }}>{row.product_count}</td>
                        <td style={{ padding: "8px 8px" }}>{row.total_cbm.toFixed(4)}</td>
                        <td style={{ padding: "8px 8px" }}>{row.total_weight.toFixed(2)}</td>
                        <td style={{ padding: "8px 8px" }}>{row.total_gmv.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {getSupplierViewTable(results).length > 15 && (
                  <div style={{ color: "#64748b", fontSize: 14, marginTop: 8 }}>
                    Showing first 15 rows. Download for full data.
                  </div>
                )}
              </div>
            </div>

            {/* Customer Area View Table */}
            <div style={{ background: "#fff", borderRadius: 14, padding: 24, boxShadow: "0 2px 12px 0 rgba(0,0,0,0.04)", marginBottom: 32 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <h3 style={{ color: "#0f172a", fontWeight: 700, fontSize: 20, marginBottom: 0 }}>
                  Customer Area View
                </h3>
                <button
                  onClick={() => downloadTableAsExcel(
                    getCustomerAreaViewTable(results),
                    [
                      { key: "supplier_name", label: "Supplier" },
                      { key: "customer_area", label: "Customer Area" },
                      { key: "retailer_count", label: "Retailer Count" },
                      { key: "order_count", label: "Order Count" },
                      { key: "total_cbm", label: "Total CBM", fixed: 4 },
                      { key: "total_weight", label: "Total Weight", fixed: 2 },
                      { key: "total_gmv", label: "Total GMV", fixed: 2 }
                    ],
                    "customer_area_view.xlsx"
                  )}
                  style={{
                    background: "linear-gradient(90deg, #22c55e 0%, #bef264 100%)",
                    color: "#fff",
                    padding: "8px 18px",
                    borderRadius: 7,
                    fontWeight: 600,
                    fontSize: 15,
                    border: "none",
                    cursor: "pointer",
                    boxShadow: "0 2px 8px 0 rgba(34,197,94,0.08)"
                  }}
                >
                  Download Sheet
                </button>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15, background: "#f8fafc", borderRadius: 10, overflow: "hidden" }}>
                  <thead>
                    <tr style={{ background: "#e0e7ef" }}>
                      <th style={{ padding: "10px 8px" }}>Supplier</th>
                      <th style={{ padding: "10px 8px" }}>Customer Area</th>
                      <th style={{ padding: "10px 8px" }}>Retailer Count</th>
                      <th style={{ padding: "10px 8px" }}>Order Count</th>
                      <th style={{ padding: "10px 8px" }}>Total CBM</th>
                      <th style={{ padding: "10px 8px" }}>Total Weight</th>
                      <th style={{ padding: "10px 8px" }}>Total GMV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getCustomerAreaViewTable(results).slice(0, 15).map((row, idx) => (
                      <tr key={idx} style={{ background: idx % 2 === 0 ? "#fff" : "#f1f5f9" }}>
                        <td style={{ padding: "8px 8px" }}>{row.supplier_name}</td>
                        <td style={{ padding: "8px 8px" }}>{row.customer_area}</td>
                        <td style={{ padding: "8px 8px" }}>{row.retailer_count}</td>
                        <td style={{ padding: "8px 8px" }}>{row.order_count}</td>
                        <td style={{ padding: "8px 8px" }}>{row.total_cbm.toFixed(4)}</td>
                        <td style={{ padding: "8px 8px" }}>{row.total_weight.toFixed(2)}</td>
                        <td style={{ padding: "8px 8px" }}>{row.total_gmv.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {getCustomerAreaViewTable(results).length > 15 && (
                  <div style={{ color: "#64748b", fontSize: 14, marginTop: 8 }}>
                    Showing first 15 rows. Download for full data.
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Footer Note */}
        <div style={{ marginTop: 32, textAlign: 'center', color: '#64748b', fontSize: 15 }}>
          <span>
            Need help? See the <b>How to use</b> instructions in the sidebar or contact support.
          </span>
        </div>
      </div>
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
