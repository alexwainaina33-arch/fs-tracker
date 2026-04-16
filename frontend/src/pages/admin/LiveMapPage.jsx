import React, { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, useMap } from "react-leaflet";
import { useQuery } from "@tanstack/react-query";
import { pb } from "../../lib/pb";
import { Badge } from "../../components/ui/Badge";
import { format, differenceInMinutes } from "date-fns";
import { Battery, Navigation, AlertTriangle } from "lucide-react";
import "leaflet/dist/leaflet.css";

const KE_CENTER = [-1.286389, 36.817223];
const STALE_MIN = 10;

function FlyTo({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (positions?.length === 1) map.flyTo([positions[0].latitude, positions[0].longitude], 13);
    else if (positions?.length > 1) map.flyToBounds(positions.map(p => [p.latitude, p.longitude]), { padding: [40,40] });
  }, [positions?.length]);
  return null;
}

export default function LiveMapPage() {
  const { data: locs } = useQuery({
    queryKey: ["map-locs"],
    queryFn:  async () => {
      const list = await pb.collection("ft_locations").getList(1, 500, {
        sort:   "-recorded_at",
        filter: `recorded_at >= "${new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()}"`,
        expand: "user",
      });
      const latest = {};
      const trails = {};
      for (const loc of list.items) {
        if (!latest[loc.user]) { latest[loc.user] = loc; trails[loc.user] = []; }
        trails[loc.user].push([loc.latitude, loc.longitude]);
      }
      return { latest: Object.values(latest), trails };
    },
    refetchInterval: 15000,
  });

  const positions = locs?.latest ?? [];
  const now       = new Date();
  const staleCount = positions.filter(p => differenceInMinutes(now, new Date(p.recorded_at)) > STALE_MIN).length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-4 px-5 py-3 border-b border-[#21272f] flex-shrink-0">
        <div className="flex items-center gap-2 text-sm text-[#c2cad4]">
          <span className="w-2 h-2 rounded-full bg-[#00c096] animate-pulse" />
          {positions.length} live
        </div>
        {staleCount > 0 && (
          <div className="flex items-center gap-1.5 text-sm text-[#ffab00]">
            <AlertTriangle size={13} /> {staleCount} stale
          </div>
        )}
        <span className="ml-auto text-xs text-[#8b95a1] font-mono">Auto-refreshes every 15s</span>
      </div>

      <div className="flex-1 relative">
        <MapContainer center={KE_CENTER} zoom={7} className="h-full w-full">
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <FlyTo positions={positions} />
          {positions.map(loc => {
            const minAgo = differenceInMinutes(now, new Date(loc.recorded_at));
            const stale  = minAgo > STALE_MIN;
            const trail  = locs?.trails?.[loc.user] ?? [];
            const color  = stale ? "#ffab00" : "#c8f230";
            return (
              <React.Fragment key={loc.id}>
                {trail.length > 1 && (
                  <Polyline positions={trail} pathOptions={{ color: color + "60", weight: 2, dashArray: "4 6" }} />
                )}
                <CircleMarker center={[loc.latitude, loc.longitude]} radius={stale ? 8 : 10}
                  pathOptions={{ color, fillColor: color, fillOpacity: 0.85, weight: 2 }}>
                  <Popup>
                    <div className="min-w-[180px] space-y-2">
                      <p className="font-bold text-white">{loc.expand?.user?.name ?? "Unknown"}</p>
                      <p className="text-xs font-mono text-[#8b95a1]">
                        {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}<br />±{loc.accuracy_meters}m
                      </p>
                      <div className="flex items-center gap-3 text-xs">
                        {loc.battery_level != null && <span className="flex items-center gap-1 text-[#00c096]"><Battery size={11} />{loc.battery_level}%</span>}
                        <span className="flex items-center gap-1 text-[#8b95a1]"><Navigation size={11} />{loc.speed_kmh ?? 0} km/h</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge label={stale ? "stale" : "live"} color={stale ? "warn" : "ok"} size="xs" />
                        <span className="text-xs text-[#8b95a1]">{minAgo}min ago</span>
                      </div>
                      <a href={`https://maps.google.com/?q=${loc.latitude},${loc.longitude}`}
                        target="_blank" rel="noreferrer" className="block text-center text-xs text-[#c8f230] hover:underline">
                        Open in Google Maps
                      </a>
                    </div>
                  </Popup>
                </CircleMarker>
              </React.Fragment>
            );
          })}
        </MapContainer>

        <div className="absolute bottom-4 left-4 z-[400] glass rounded-xl px-4 py-3 space-y-1.5">
          <p className="text-xs text-[#8b95a1] font-medium uppercase tracking-wider mb-2">Legend</p>
          <div className="flex items-center gap-2 text-xs text-[#c2cad4]"><div className="w-3 h-3 rounded-full bg-[#c8f230]" /> Active (&lt;10min)</div>
          <div className="flex items-center gap-2 text-xs text-[#c2cad4]"><div className="w-3 h-3 rounded-full bg-[#ffab00]" /> Stale (&gt;10min)</div>
        </div>
      </div>
    </div>
  );
}
