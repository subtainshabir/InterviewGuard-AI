import Header from "../components/dashboard/Header";
import CameraPanel from "../components/dashboard/CameraPanel";
import RiskPanel from "../components/dashboard/RiskPanel";
import MonitoringStatus from "../components/dashboard/MonitoringStatus";
import AlertsPanel from "../components/dashboard/AlertsPanel";
import DetectionPanel from "../components/dashboard/DetectionPanel";
import EvidenceTimeline from "../components/dashboard/EvidenceTimeline";
import InterviewInfo from "../components/dashboard/InterviewInfo";
import { useBackendStatus } from "../services/useBackendStatus";
import { useInterviewSession } from "../services/useInterviewSession";
import { formatDuration } from "../services/formatDuration";

export default function Dashboard() {
  const backendStatus = useBackendStatus();
  const { session, loading, error, busy, elapsedSeconds, start, pause, resume, end } =
    useInterviewSession();

  const elapsedLabel = formatDuration(elapsedSeconds);

  return (
    <div className="dashboard">
      <Header
        backendStatus={backendStatus}
        session={session}
        elapsedLabel={elapsedLabel}
        busy={busy}
        onStart={start}
        onPause={pause}
        onResume={resume}
        onEnd={end}
      />

      <main className="dashboard-body">
        {error && <div className="session-error">{error}</div>}
        {loading && !session && <div className="session-loading">Preparing interview session…</div>}

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

        <InterviewInfo session={session} elapsedLabel={elapsedLabel} />
      </main>
    </div>
  );
}