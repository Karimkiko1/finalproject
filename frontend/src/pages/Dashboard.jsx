import React, { useEffect, useState } from "react";
import { Bar, Pie } from "react-chartjs-2";
import { Chart, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from "chart.js";
Chart.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const Dashboard = () => {
  // Replace these with real data fetching from Google Sheets or backend
  const [metrics, setMetrics] = useState({
    avg_hours_approve: { value: "12.5", change: "+8.3%" },
    avg_days_deliver: { value: "3.2", change: "-5.2%" },
    avg_days_pending: { value: "1.5", change: "+2.1%" },
    logistics_delivery: { "48hrs": "76.5%", "24hrs": "32.4%", change: "+3.8%" },
    cartona_delivery: { "48hrs": "70.3%", "24hrs": "26.0%", change: "+2.1%" }
  });

  // Example chart data
  const pieData = {
    labels: ["Supplier A", "Supplier B", "Supplier C"],
    datasets: [
      {
        data: [300, 500, 200],
        backgroundColor: ["#1e40af", "#10b981", "#f59e42"]
      }
    ]
  };

  const barData = {
    labels: ["Runsheet 1", "Runsheet 2", "Runsheet 3"],
    datasets: [
      {
        label: "Task Count",
        data: [12, 19, 7],
        backgroundColor: "#3b82f6"
      }
    ]
  };

  return (
    <div style={{ padding: "24px" }}>
      <h1>Logistics Admin Dashboard</h1>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 32 }}>
        <div style={{ background: "#1e40af", color: "#fff", borderRadius: 8, padding: 20, minWidth: 180, flex: "1 1 180px" }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Avg Hours to Approve</div>
          <div style={{ fontSize: 32, fontWeight: 700, margin: "8px 0" }}>{metrics.avg_hours_approve.value}</div>
          <div style={{ fontSize: 14 }}>{metrics.avg_hours_approve.change} <span style={{ opacity: 0.7 }}>vs last month</span></div>
        </div>
        <div style={{ background: "#065f46", color: "#fff", borderRadius: 8, padding: 20, minWidth: 180, flex: "1 1 180px" }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Avg Days to Deliver</div>
          <div style={{ fontSize: 32, fontWeight: 700, margin: "8px 0" }}>{metrics.avg_days_deliver.value}</div>
          <div style={{ fontSize: 14 }}>{metrics.avg_days_deliver.change} <span style={{ opacity: 0.7 }}>vs last month</span></div>
        </div>
        <div style={{ background: "#7c2d12", color: "#fff", borderRadius: 8, padding: 20, minWidth: 180, flex: "1 1 180px" }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Avg Days Pending</div>
          <div style={{ fontSize: 32, fontWeight: 700, margin: "8px 0" }}>{metrics.avg_days_pending.value}</div>
          <div style={{ fontSize: 14 }}>{metrics.avg_days_pending.change} <span style={{ opacity: 0.7 }}>vs last month</span></div>
        </div>
        <div style={{ background: "#be123c", color: "#fff", borderRadius: 8, padding: 20, minWidth: 180, flex: "1 1 180px" }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Fast Delivery 48Hrs</div>
          <div style={{ fontSize: 32, fontWeight: 700, margin: "8px 0" }}>{metrics.logistics_delivery["48hrs"]}</div>
          <div style={{ fontSize: 14 }}>{metrics.logistics_delivery.change} <span style={{ opacity: 0.7 }}>vs last month</span></div>
        </div>
        <div style={{ background: "#0f766e", color: "#fff", borderRadius: 8, padding: 20, minWidth: 180, flex: "1 1 180px" }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Fast Delivery 24Hrs</div>
          <div style={{ fontSize: 32, fontWeight: 700, margin: "8px 0" }}>{metrics.logistics_delivery["24hrs"]}</div>
          <div style={{ fontSize: 14 }}>{metrics.cartona_delivery.change} <span style={{ opacity: 0.7 }}>vs last month</span></div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 32, flexWrap: "wrap", marginBottom: 32 }}>
        <div style={{ flex: 1, minWidth: 320 }}>
          <h3>Supplier GMV Share</h3>
          <Pie data={pieData} />
        </div>
        <div style={{ flex: 1, minWidth: 320 }}>
          <h3>Task Count by Runsheet</h3>
          <Bar data={barData} options={{ plugins: { legend: { display: false } } }} />
        </div>
      </div>
      {/* Add more dashboard widgets as needed */}
    </div>
  );
};

export default Dashboard;
