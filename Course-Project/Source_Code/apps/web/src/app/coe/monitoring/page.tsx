import { Metadata } from "next";
import { LiveProctoringConsole } from "@/components/coe/LiveProctoringConsole";

export const metadata: Metadata = {
  title: "COE & Invigilator Live Monitoring — KLE Technological University",
  description: "Real-time candidate monitoring, telemetry stream, and supervisory controls.",
};

export default function CoeMonitoringPage() {
  return (
    <div className="h-screen w-full overflow-hidden bg-slate-900">
      <LiveProctoringConsole role="COE_ADMIN" baseRoute="/coe/monitoring" />
    </div>
  );
}
