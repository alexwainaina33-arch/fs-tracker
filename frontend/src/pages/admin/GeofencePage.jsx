import React, { useState } from "react";
import { MapContainer, TileLayer, Circle, useMapEvents } from "react-leaflet";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pb } from "../../lib/pb";
import { useAuth } from "../../store/auth";
import { Btn } from "../../components/ui/Btn";
import { Input, Select } from "../../components/ui/Input";
import { Badge } from "../../components/ui/Badge";
import { Shield, Plus, Trash2, MapPin, X } from "lucide-react";
import toast from "react-hot-toast";
import "leaflet/dist/leaflet.css";

const KE_CENTER = [-1.286389, 36.817223];

const ZONE_TYPES = [
  "office",
  "client_site",
  "warehouse",
  "restricted",
  "sales_zone",
  "service_area",
];

// ─────────────────────────────────────────────────────────────────────────────
// BottomSheet — fully self-contained, no dependency on Modal.jsx.
// z-[99999] puts it above Leaflet tiles (z ~400), controls, and every overlay.
// The content area scrolls internally so no field is ever cut off.
// ─────────────────────────────────────────────────────────────────────────────
function BottomSheet({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[99999] flex flex-col justify-end">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* card — max 88 % of viewport height */}
      <div
        className="relative bg-[#111418] border-t border-[#21272f] rounded-t-2xl w-full flex flex-col"
        style={{ maxHeight: "88vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* drag handle pill */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-[#2a3040]" />

        {/* fixed header */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 pt-6 pb-4 border-b border-[#21272f]">
          <h3 className="font-display font-bold text-white text-base">{title}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#21272f] flex items-center justify-center text-[#8b95a1] hover:text-white transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 py-5">
          {children}
        </div>
      </div>
    </div>
  );
}

function MapClickHandler({ onPick }) {
  useMapEvents({ click: (e) => onPick(e.latlng) });
  return null;
}

export default function GeofencePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [picking,    setPicking]    = useState(false);

  const blank = {
    name:           "",
    type:           "office",
    latitude:       "",
    longitude:      "",
    radius_meters:  500,
    alert_on_exit:  true,
    alert_on_entry: false,
    is_active:      true,
  };
  const [form, setForm] = useState(blank);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const close = () => { setShowCreate(false); setForm(blank); };

  const { data } = useQuery({
    queryKey: ["geofences"],
    queryFn:  () => pb.collection("ft_geofences").getList(1, 100, { sort: "name" }),
    refetchInterval: 30000,
  });

  const createMut = useMutation({
    mutationFn: (d) =>
      pb.collection("ft_geofences").create({
        ...d,
        latitude:      parseFloat(d.latitude),
        longitude:     parseFloat(d.longitude),
        radius_meters: parseInt(d.radius_meters, 10),
      }),
    onSuccess: () => {
      qc.invalidateQueries(["geofences"]);
      close();
      toast.success("Zone created");
    },
    onError: (e) => {
      console.error("Geofence create error:", e?.response?.data ?? e);
      toast.error("Failed to create zone");
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => pb.collection("ft_geofences").delete(id),
    onSuccess:  () => { qc.invalidateQueries(["geofences"]); toast.success("Zone deleted"); },
  });

  const zones = data?.items ?? [];

  return (
    <div className="p-5 max-w-6xl mx-auto space-y-5 pb-8">

      {/* header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl text-white flex items-center gap-2">
            <Shield size={20} className="text-[#c8f230]" /> Geofence Zones
          </h1>
          <p className="text-[#8b95a1] text-sm">{zones.length} zones configured</p>
        </div>
        <Btn onClick={() => setPicking(true)}>
          <Plus size={16} /> Add Zone
        </Btn>
      </div>

      {/* picking instruction */}
      {picking && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[#c8f230]/10 border border-[#c8f230]/30">
          <MapPin size={16} className="text-[#c8f230] animate-pulse flex-shrink-0" />
          <p className="text-[#c8f230] text-sm font-medium">
            Click anywhere on the map to pin the zone centre.
          </p>
          <button
            onClick={() => setPicking(false)}
            className="ml-auto text-[#8b95a1] hover:text-white text-xs underline flex-shrink-0"
          >
            Cancel
          </button>
        </div>
      )}

      {/* map */}
      <div className="rounded-2xl overflow-hidden border border-[#21272f] h-80">
        <MapContainer center={KE_CENTER} zoom={7} className="h-full w-full">
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {picking && (
            <MapClickHandler
              onPick={(latlng) => {
                set("latitude",  latlng.lat.toFixed(6));
                set("longitude", latlng.lng.toFixed(6));
                setPicking(false);
                setShowCreate(true);
                toast.success("Location pinned!");
              }}
            />
          )}
          {zones.map((z) =>
            z.latitude && z.longitude ? (
              <Circle
                key={z.id}
                center={[z.latitude, z.longitude]}
                radius={z.radius_meters}
                pathOptions={{ color: "#c8f230", fillColor: "#c8f230", fillOpacity: 0.08, weight: 2 }}
              />
            ) : null
          )}
        </MapContainer>
      </div>

      {/* zone list */}
      <div className="space-y-3">
        {zones.map((z) => (
          <div key={z.id} className="bg-[#111418] border border-[#21272f] rounded-2xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-[#c8f230]/10 border border-[#c8f230]/20 flex items-center justify-center flex-shrink-0">
              <Shield size={18} className="text-[#c8f230]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white">{z.name}</p>
              <p className="text-xs text-[#8b95a1] font-mono">
                {z.latitude}, {z.longitude} · {z.radius_meters}m radius
              </p>
            </div>
            <div className="flex items-center gap-2">
              {z.alert_on_exit  && <Badge label="exit alert"  color="warn" size="xs" />}
              {z.alert_on_entry && <Badge label="enter alert" color="ok"   size="xs" />}
            </div>
            <button
              onClick={() => { if (confirm("Delete this zone?")) deleteMut.mutate(z.id); }}
              className="text-[#8b95a1] hover:text-[#ff4d4f] transition-colors p-1"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        {!zones.length && (
          <div className="text-center py-16 text-[#8b95a1]">
            <Shield size={48} className="mx-auto mb-3 opacity-20" />
            No zones yet — click Add Zone to start
          </div>
        )}
      </div>

      {/* ── Create zone bottom sheet ── */}
      <BottomSheet open={showCreate} onClose={close} title="Create Geofence Zone">
        <div className="space-y-4">

          <Input
            label="Zone Name *"
            placeholder="e.g. Nairobi Head Office"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
          />

          <Select
            label="Zone Type"
            value={form.type}
            onChange={(e) => set("type", e.target.value)}
          >
            {ZONE_TYPES.map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
            ))}
          </Select>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Centre Latitude"
              placeholder="auto-filled from map"
              value={form.latitude}
              onChange={(e) => set("latitude", e.target.value)}
            />
            <Input
              label="Centre Longitude"
              placeholder="auto-filled from map"
              value={form.longitude}
              onChange={(e) => set("longitude", e.target.value)}
            />
          </div>

          <Input
            label="Radius (metres)"
            type="number"
            placeholder="500"
            value={form.radius_meters}
            onChange={(e) => set("radius_meters", Number(e.target.value))}
          />

          <div className="flex flex-wrap items-center gap-6 py-1">
            <label className="flex items-center gap-2 text-sm text-[#c2cad4] cursor-pointer">
              <input
                type="checkbox"
                checked={form.alert_on_exit}
                onChange={(e) => set("alert_on_exit", e.target.checked)}
                className="w-4 h-4 accent-[#c8f230]"
              />
              Alert when staff EXIT
            </label>
            <label className="flex items-center gap-2 text-sm text-[#c2cad4] cursor-pointer">
              <input
                type="checkbox"
                checked={form.alert_on_entry}
                onChange={(e) => set("alert_on_entry", e.target.checked)}
                className="w-4 h-4 accent-[#c8f230]"
              />
              Alert when staff ENTER
            </label>
          </div>

          {form.latitude && (
            <p className="text-xs text-[#8b95a1] font-mono bg-[#0a0d0f] rounded-lg px-3 py-2">
              📍 {form.latitude}, {form.longitude}
            </p>
          )}

          {/* action buttons — inside scroll area so always reachable */}
          <div className="flex gap-3 pt-4 border-t border-[#21272f]">
            <Btn variant="ghost" onClick={close} className="flex-1">Cancel</Btn>
            <Btn
              onClick={() => createMut.mutate(form)}
              disabled={!form.name || !form.latitude || createMut.isPending}
              className="flex-1"
            >
              {createMut.isPending ? "Creating…" : "Create Zone"}
            </Btn>
          </div>

        </div>
      </BottomSheet>

    </div>
  );
}
