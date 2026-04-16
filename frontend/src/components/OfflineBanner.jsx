import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { WifiOff } from "lucide-react";

export default function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div className="offline-banner fixed top-0 left-0 right-0 z-[300] bg-[#ffab00] text-[#0a0d0f] px-4 py-2 flex items-center gap-2 text-sm font-medium">
      <WifiOff size={14} />
      Offline — actions will sync automatically when reconnected
    </div>
  );
}
