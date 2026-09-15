import Header from "../components/dashboard/Header";
import CameraPanel from "../components/dashboard/CameraPanel";
import RiskPanel from "../components/dashboard/RiskPanel";
import MonitoringStatus from "../components/dashboard/MonitoringStatus";
import AlertsPanel from "../components/dashboard/AlertsPanel";
import DetectionPanel from "../components/dashboard/DetectionPanel";
import EvidenceTimeline from "../components/dashboard/EvidenceTimeline";
import InterviewInfo from "../components/dashboard/InterviewInfo";
import { useBackendStatus } from "../services/useBackendStatus";

export default function Dashboard() {
  const backendStatus = useBackendStatus();

  return (
    <div className="dashboard">
      <Header backendStatus={backendStatus} />

      <main className="dashboard-body">
        <div className="dashboard-row dashboard-row-top">
          <CameraPanel />
          <RiskPanel />
        </div>

        <MonitoringStatus />

        <div className="dashboard-row dashboard-row-mid">
          <AlertsPanel />
          <DetectionPanel />
        </div>

        <EvidenceTimeline />

        <InterviewInfo />
      </main>
    </div>
  );
}