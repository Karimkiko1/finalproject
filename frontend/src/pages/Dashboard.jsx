// import React, { useEffect, useState } from "react";
// import { Bar, Pie } from "react-chartjs-2";
// import { Chart, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from "chart.js";
// import { loadSheetData } from "../utils/googleSheets";
// Chart.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

// const Dashboard = () => {
//   const [metrics, setMetrics] = useState({
//     avg_hours_approve: { value: "-", change: "-" },
//     avg_days_deliver: { value: "-", change: "-" },
//     avg_days_pending: { value: "-", change: "-" },
//     logistics_delivery: { "48hrs": "-", "24hrs": "-", change: "-" },
//     cartona_delivery: { "48hrs": "-", "24hrs": "-", change: "-" }
//   });

//   useEffect(() => {
//     async function fetchOverview() {
//       try {
//         const rows = await loadSheetData("Overview");
//         if (!rows || rows.length < 2) return;
//         // Assume first row is header, second is this month, third is last month
//         const header = Object.keys(rows[0]);
//         const thisMonth = rows[0];
//         const lastMonth = rows[1];

//         // Helper to get value by possible header names
//         const getVal = (row, keys) => {
//           for (let k of keys) {
//             if (row[k] !== undefined) return row[k];
//             // Try case-insensitive match
//             const found = Object.keys(row).find(h => h.toLowerCase() === k.toLowerCase());
//             if (found) return row[found];
//           }
//           return "-";
//         };

//         // Calculate % change
//         const percentChange = (curr, prev) => {
//           const c = parseFloat(curr);
//           const p = parseFloat(prev);
//           if (isNaN(c) || isNaN(p) || p === 0) return "-";
//           const diff = ((c - p) / p) * 100;
//           return (diff > 0 ? "+" : "") + diff.toFixed(1) + "%";
//         };

//         setMetrics({
//           avg_hours_approve: {
//             value: getVal(thisMonth, ["Avg Hours to Approve", "avg_hours_approve"]),
//             change: percentChange(getVal(thisMonth, ["Avg Hours to Approve", "avg_hours_approve"]), getVal(lastMonth, ["Avg Hours to Approve", "avg_hours_approve"]))
//           },
//           avg_days_deliver: {
//             value: getVal(thisMonth, ["Avg Days to Deliver", "avg_days_deliver"]),
//             change: percentChange(getVal(thisMonth, ["Avg Days to Deliver", "avg_days_deliver"]), getVal(lastMonth, ["Avg Days to Deliver", "avg_days_deliver"]))
//           },
//           avg_days_pending: {
//             value: getVal(thisMonth, ["Avg Days Pending", "avg_days_pending"]),
//             change: percentChange(getVal(thisMonth, ["Avg Days Pending", "avg_days_pending"]), getVal(lastMonth, ["Avg Days Pending", "avg_days_pending"]))
//           },
//           logistics_delivery: {
//             "48hrs": getVal(thisMonth, ["Logistics Delivery 48hrs", "logistics_delivery_48hrs"]),
//             "24hrs": getVal(thisMonth, ["Logistics Delivery 24hrs", "logistics_delivery_24hrs"]),
//             change: percentChange(getVal(thisMonth, ["Logistics Delivery 48hrs", "logistics_delivery_48hrs"]), getVal(lastMonth, ["Logistics Delivery 48hrs", "logistics_delivery_48hrs"]))
//           },
//           cartona_delivery: {
//             "48hrs": getVal(thisMonth, ["Cartona Delivery 48hrs", "cartona_delivery_48hrs"]),
//             "24hrs": getVal(thisMonth, ["Cartona Delivery 24hrs", "cartona_delivery_24hrs"]),
//             change: percentChange(getVal(thisMonth, ["Cartona Delivery 48hrs", "cartona_delivery_48hrs"]), getVal(lastMonth, ["Cartona Delivery 48hrs", "cartona_delivery_48hrs"]))
//           }
//         });
//       } catch (e) {
//         // fallback: keep default metrics
//       }
//     }
//     fetchOverview();
//   }, []);

//   // Example chart data
//   const pieData = {
//     labels: ["Supplier A", "Supplier B", "Supplier C"],
//     datasets: [
//       {
//         data: [300, 500, 200],
//         backgroundColor: ["#1e40af", "#10b981", "#f59e42"]
//       }
//     ]
//   };

//   const barData = {
//     labels: ["Runsheet 1", "Runsheet 2", "Runsheet 3"],
//     datasets: [
//       {
//         label: "Task Count",
//         data: [12, 19, 7],
//         backgroundColor: "#3b82f6"
//       }
//     ]
//   };

//   return (
//     <div style={{ padding: "24px" }}>
//       <h1>Logistics Admin Dashboard</h1>
//       <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 32 }}>
//         <div style={{ background: "#1e40af", color: "#fff", borderRadius: 8, padding: 20, minWidth: 180, flex: "1 1 180px" }}>
//           <div style={{ fontSize: 18, fontWeight: 600 }}>Avg Hours to Approve</div>
//           <div style={{ fontSize: 32, fontWeight: 700, margin: "8px 0" }}>{metrics.avg_hours_approve.value}</div>
//           <div style={{ fontSize: 14 }}>{metrics.avg_hours_approve.change} <span style={{ opacity: 0.7 }}>vs last month</span></div>
//         </div>
//         <div style={{ background: "#065f46", color: "#fff", borderRadius: 8, padding: 20, minWidth: 180, flex: "1 1 180px" }}>
//           <div style={{ fontSize: 18, fontWeight: 600 }}>Avg Days to Deliver</div>
//           <div style={{ fontSize: 32, fontWeight: 700, margin: "8px 0" }}>{metrics.avg_days_deliver.value}</div>
//           <div style={{ fontSize: 14 }}>{metrics.avg_days_deliver.change} <span style={{ opacity: 0.7 }}>vs last month</span></div>
//         </div>
//         <div style={{ background: "#7c2d12", color: "#fff", borderRadius: 8, padding: 20, minWidth: 180, flex: "1 1 180px" }}>
//           <div style={{ fontSize: 18, fontWeight: 600 }}>Avg Days Pending</div>
//           <div style={{ fontSize: 32, fontWeight: 700, margin: "8px 0" }}>{metrics.avg_days_pending.value}</div>
//           <div style={{ fontSize: 14 }}>{metrics.avg_days_pending.change} <span style={{ opacity: 0.7 }}>vs last month</span></div>
//         </div>
//         <div style={{ background: "#be123c", color: "#fff", borderRadius: 8, padding: 20, minWidth: 180, flex: "1 1 180px" }}>
//           <div style={{ fontSize: 18, fontWeight: 600 }}>Fast Delivery 48Hrs</div>
//           <div style={{ fontSize: 32, fontWeight: 700, margin: "8px 0" }}>{metrics.logistics_delivery["48hrs"]}</div>
//           <div style={{ fontSize: 14 }}>{metrics.logistics_delivery.change} <span style={{ opacity: 0.7 }}>vs last month</span></div>
//         </div>
//         <div style={{ background: "#0f766e", color: "#fff", borderRadius: 8, padding: 20, minWidth: 180, flex: "1 1 180px" }}>
//           <div style={{ fontSize: 18, fontWeight: 600 }}>Fast Delivery 24Hrs</div>
//           <div style={{ fontSize: 32, fontWeight: 700, margin: "8px 0" }}>{metrics.logistics_delivery["24hrs"]}</div>
//           <div style={{ fontSize: 14 }}>{metrics.cartona_delivery.change} <span style={{ opacity: 0.7 }}>vs last month</span></div>
//         </div>
//       </div>
//       <div style={{ display: "flex", gap: 32, flexWrap: "wrap", marginBottom: 32 }}>
//         <div style={{ flex: 1, minWidth: 320 }}>
//           <h3>Supplier GMV Share</h3>
//           <Pie data={pieData} />
//         </div>
//         <div style={{ flex: 1, minWidth: 320 }}>
//           <h3>Task Count by Runsheet</h3>
//           <Bar data={barData} options={{ plugins: { legend: { display: false } } }} />
//         </div>
//       </div>
//       {/* Add more dashboard widgets as needed */}
//     </div>
//   );
// };

// export default Dashboard;
