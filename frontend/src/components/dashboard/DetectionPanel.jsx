import { useState } from "react";
import { Boxes, Users } from "lucide-react";
import { mockDetections } from "../../data/mockDashboardData";

const TABS = [
  { key: "objects", label: "Objects", icon: Boxes, empty: "No objects detected" },
  { key: "people", label: "People", icon: Users, empty: "Only candidate detected" },
];

export default function DetectionPanel() {
  const [activeTab, setActiveTab] = useState("objects");
  const tab = TABS.find((t) => t.key === activeTab);
  const items = mockDetections[activeTab];

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Detections</h2>
      </div>

      <div className="tab-row" role="tablist">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            role="tab"
            aria-selected={activeTab === key}
            className={`tab-button ${activeTab === key ? "tab-active" : ""}`}
            onClick={() => setActiveTab(key)}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {items.length > 0 ? (
        <ul className="detection-list">
          {items.map((item) => (
            <li key={item.id}>{item.label}</li>
          ))}
        </ul>
      ) : (
        <div className="empty-state">
          <tab.icon size={22} strokeWidth={1.5} />
          <p className="empty-title">{tab.empty}</p>
        </div>
      )}
    </section>
  );
}