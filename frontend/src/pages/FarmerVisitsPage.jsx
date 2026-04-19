// src/pages/FarmerVisitsPage.jsx
// Offline-safe: farm visits queued when no internet (photos need online)

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pb } from "../lib/pb";
import { useAuth } from "../store/auth";
import { useGPS } from "../hooks/useGPS";
import { isOnline, enqueueFarmerVisit } from "../lib/offlineQueue";
import { Modal } from "../components/ui/Modal";
import { Btn } from "../components/ui/Btn";
import { Badge } from "../components/ui/Badge";
import { Input, Select, Textarea } from "../components/ui/Input";
import CameraCapture from "../components/CameraCapture";
import {
  Leaf, Plus, Camera, MapPin, Sprout,
  Search, Download, WifiOff,
} from "lucide-react";
import { format } from "date-fns";
import { exportFarmerVisitsReport } from "../lib/reportExport";
import toast from "react-hot-toast";

const KENYA_COUNTIES = [
  "Baringo","Bomet","Bungoma","Busia","Elgeyo-Marakwet","Embu","Garissa","Homa Bay",
  "Isiolo","Kajiado","Kakamega","Kericho","Kiambu","Kilifi","Kirinyaga","Kisii",
  "Kisumu","Kitui","Kwale","Laikipia","Lamu","Machakos","Makueni","Mandera",
  "Marsabit","Meru","Migori","Mombasa","Murang'a","Nairobi","Nakuru","Nandi",
  "Narok","Nyamira","Nyandarua","Nyeri","Samburu","Siaya","Taita-Taveta","Tana River",
  "Tharaka-Nithi","Trans Nzoia","Turkana","Uasin Gishu","Vihiga","Wajir","West Pokot",
];

const CROPS = [
  "Maize","Wheat","Rice","Tea","Coffee","Horticulture","Tomatoes","Onions",
  "Potatoes","Beans","Avocado","Mango","Banana","Sunflower","Sorghum",
  "Dairy (Livestock)","Poultry","Sugarcane","Cotton","Other",
];

const VISIT_PURPOSES = ["demo","education","sale","follow_up","complaint","prospecting"];
const VISIT_OUTCOMES = ["interested","purchased","not_interested","follow_up_needed","complaint_resolved"];
const SOIL_TYPES     = ["clay","loam","sandy","black_cotton","other"];

const OUTCOME_COLORS = {
  purchased:          "ok",
  interested:         "blue",
  not_interested:     "default",
  follow_up_needed:   "warn",
  complaint_resolved: "ok",
};

const BLANK_FORM = {
  farmer_name: "", farmer_phone: "", farm_name: "", county: "",
  sub_county: "", ward: "", crops: [], acreage: "", acreage_unit: "acres",
  soil_type: "", irrigation: false, current_inputs: "",
  products_recommended: "", products_sold: "", visit_purpose: "sale",
  visit_outcome: "interested", next_visit_date: "", notes: "",
};

function VisitCard({ visit, onView }) {
  const crops = Array.isArray(visit.crops) ? visit.crops : [];
  return (
    <div
      className="bg-[#111418] border border-[#21272f] rounded-2xl p-4 hover:border-[#2a3040] transition-all cursor-pointer card-lift"
      onClick={() => onView(visit)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <Badge label={visit.visit_outcome?.replace(/_/g, " ")} color={OUTCOME_COLORS[visit.visit_outcome] ?? "default"} size="xs" />
            <Badge label={visit.visit_purpose?.replace(/_/g, " ")} size="xs" />
          </div>
          <h3 className="font-semibold text-white">{visit.farmer_name}</h3>
          {visit.farm_name && <p className="text-xs text-[#8b95a1] mt-0.5">📍 {visit.farm_name}</p>}
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className="text-xs text-[#8b95a1] flex items-center gap-1">
              <MapPin size={10} />{visit.county}{visit.sub_county ? `, ${visit.sub_county}` : ""}
            </span>
            {visit.acreage && <span className="text-xs text-[#8b95a1]">🌾 {visit.acreage} {visit.acreage_unit}</span>}
          </div>
          {crops.length > 0 && (
            <div className="flex gap-1 mt-2 flex-wrap">
              {crops.slice(0, 3).map((c) => (
                <span key={c} className="text-[10px] bg-[#c8f230]/10 text-[#c8f230] px-1.5 py-0.5 rounded-md">{c}</span>
              ))}
              {crops.length > 3 && <span className="text-[10px] text-[#8b95a1]">+{crops.length - 3}</span>}
            </div>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          {visit.expand?.staff && <p className="text-[10px] text-[#8b95a1] mt-1">{visit.expand.staff.name}</p>}
        </div>
      </div>
    </div>
  );
}

function CropSelector({ selected, onChange }) {
  return (
    <div>
      <label className="text-xs font-medium text-[#8b95a1] uppercase tracking-wider block mb-2">Crops Grown</label>
      <div className="flex flex-wrap gap-1.5">
        {CROPS.map((crop) => {
          const isSelected = selected.includes(crop);
          return (
            <button key={crop} type="button"
              onClick={() => onChange(isSelected ? selected.filter((c) => c !== crop) : [...selected, crop])}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                isSelected ? "bg-[#c8f230] text-[#0a0d0f]" : "bg-[#21272f] text-[#8b95a1] hover:text-white"
              }`}>
              {crop}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function FarmerVisitsPage() {
  const { user }    = useAuth();
  const isAdmin     = ["admin", "manager", "supervisor"].includes(user?.role);
  const { position } = useGPS();
  const qc          = useQueryClient();
  const online      = isOnline();

  const [showCreate,     setShowCreate]     = useState(false);
  const [selected,       setSelected]       = useState(null);
  const [camOpen,        setCamOpen]        = useState(false);
  const [capturedPhotos, setCapturedPhotos] = useState([]);
  const [searchQuery,    setSearchQuery]    = useState("");
  const [filterCounty,   setFilterCounty]   = useState("");
  const [form,           setForm]           = useState(BLANK_FORM);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const { data, isLoading } = useQuery({
    queryKey: ["farmer-visits", user?.id, isAdmin, searchQuery, filterCounty],
    queryFn: () => {
      const parts = [];
      if (!isAdmin) parts.push(`staff = "${user.id}"`);
      if (filterCounty) parts.push(`county = "${filterCounty}"`);
      if (searchQuery)  parts.push(`farmer_name ~ "${searchQuery}" || farm_name ~ "${searchQuery}"`);
      return pb.collection("ft_farmer_visits").getList(1, 200, {
        filter: parts.join(" && ") || "",
        sort:   "-id",
        expand: "staff",
      });
    },
    refetchInterval: 60000,
  });

  const createMut = useMutation({
    mutationFn: async (formData) => {
      // ── OFFLINE path ──────────────────────────────────────────────────────
      if (!isOnline()) {
        await enqueueFarmerVisit({
          farmer_name:          formData.farmer_name,
          farmer_phone:         formData.farmer_phone || "",
          farm_name:            formData.farm_name || "",
          county:               formData.county,
          sub_county:           formData.sub_county || "",
          ward:                 formData.ward || "",
          crops:                JSON.stringify(formData.crops),
          acreage:              formData.acreage || "",
          acreage_unit:         formData.acreage_unit,
          soil_type:            formData.soil_type || "",
          irrigation:           formData.irrigation,
          current_inputs:       formData.current_inputs || "",
          products_recommended: formData.products_recommended || "",
          products_sold:        formData.products_sold || "",
          visit_purpose:        formData.visit_purpose,
          visit_outcome:        formData.visit_outcome,
          next_visit_date:      formData.next_visit_date || "",
          notes:                formData.notes || "",
          staff:                user.id,
          gps_lat:              position ? String(position.latitude)  : "",
          gps_lng:              position ? String(position.longitude) : "",
        });
        return { _offline: true };
      }

      // ── ONLINE path ───────────────────────────────────────────────────────
      const fd = new FormData();
      Object.entries(formData).forEach(([k, v]) => {
        if (k === "crops")    fd.append(k, JSON.stringify(v));
        else if (k !== "_photos") fd.append(k, v === null || v === undefined ? "" : String(v));
      });
      fd.append("staff", user.id);
      if (position) {
        fd.append("gps_lat", String(position.latitude));
        fd.append("gps_lng", String(position.longitude));
      }
      for (const photo of capturedPhotos) {
        if (photo.blob) fd.append("photos", photo.blob, `farm-${Date.now()}.jpg`);
      }
      return pb.collection("ft_farmer_visits").create(fd);
    },
    onSuccess: (result) => {
      qc.invalidateQueries(["farmer-visits"]);
      setShowCreate(false);
      setForm(BLANK_FORM);
      setCapturedPhotos([]);
      if (result?._offline) {
        toast("📴 Visit saved offline — will sync when connected", {
          icon: "📴", duration: 5000,
          style: { background: "#181c21", color: "#ff9f43", border: "1px solid #ff9f43/30" },
        });
      } else {
        toast.success("✅ Farm visit recorded!");
      }
    },
    onError: (err) => {
      console.error(err);
      toast.error("Failed to save visit. Please try again.");
    },
  });

  const handleSubmit = () => {
    if (!form.farmer_name)   return toast.error("Farmer name required");
    if (!form.county)        return toast.error("County required");
    if (!form.visit_purpose) return toast.error("Visit purpose required");
    if (!form.visit_outcome) return toast.error("Visit outcome required");
    createMut.mutate(form);
  };

  const totalAcres = data?.items.reduce((s, v) => s + Number(v.acreage || 0), 0) ?? 0;
  const converted  = data?.items.filter((v) => v.visit_outcome === "purchased").length ?? 0;

  return (
    <div className="p-5 max-w-3xl mx-auto space-y-5 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl text-white flex items-center gap-2">
            <Leaf size={22} className="text-[#c8f230]" /> Farmer Visits
          </h1>
          <p className="text-[#8b95a1] text-sm mt-0.5">
            {data?.totalItems ?? 0} visits · {totalAcres.toFixed(1)} acres covered
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {!online && (
            <span className="flex items-center gap-1.5 text-xs text-[#ff9f43] bg-[#ff9f43]/10 border border-[#ff9f43]/20 px-3 py-1.5 rounded-xl">
              <WifiOff size={12} /> Offline
            </span>
          )}
          {isAdmin && (
            <button
              onClick={() => exportFarmerVisitsReport({ visits: data?.items ?? [], dateRange: "all", fmt: "excel" })}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#111418] border border-[#21272f] text-[#8b95a1] hover:text-white text-xs font-medium transition-colors"
            >
              <Download size={12} /> Export
            </button>
          )}
          <Btn onClick={() => setShowCreate(true)}><Plus size={16} /> Record Visit</Btn>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Visits",  value: data?.totalItems ?? 0,         icon: "👁️" },
          { label: "Acres Covered", value: `${totalAcres.toFixed(1)} ac`, icon: "🌾" },
          { label: "Converted",     value: converted,                     icon: "✅" },
        ].map(({ label, value, icon }) => (
          <div key={label} className="bg-[#111418] border border-[#21272f] rounded-2xl p-3 text-center">
            <p className="text-xl mb-0.5">{icon}</p>
            <p className="font-bold text-white text-base">{value}</p>
            <p className="text-[10px] text-[#8b95a1]">{label}</p>
          </div>
        ))}
      </div>

      {/* Search + filter */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b95a1]" />
          <input placeholder="Search farmer or farm…" value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#111418] border border-[#21272f] rounded-xl pl-9 pr-4 py-2.5 text-sm text-white outline-none focus:border-[#c8f230] transition-colors" />
        </div>
        <select value={filterCounty} onChange={(e) => setFilterCounty(e.target.value)}
          className="bg-[#111418] border border-[#21272f] rounded-xl px-3 py-2.5 text-sm text-[#8b95a1] outline-none focus:border-[#c8f230] transition-colors">
          <option value="">All Counties</option>
          {KENYA_COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Visits list */}
      <div className="space-y-3">
        {isLoading && <div className="py-16 text-center text-[#8b95a1] text-sm">Loading…</div>}
        {data?.items.map((visit) => <VisitCard key={visit.id} visit={visit} onView={setSelected} />)}
        {!isLoading && !data?.items.length && (
          <div className="py-16 text-center text-[#8b95a1]">
            <Leaf size={40} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm">No farm visits recorded yet</p>
          </div>
        )}
      </div>

      {/* CREATE MODAL */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Record Farm Visit" width="max-w-xl">
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">

          {/* Offline notice */}
          {!online && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-[#ff9f43]/10 border border-[#ff9f43]/20 rounded-xl">
              <WifiOff size={13} className="text-[#ff9f43] flex-shrink-0" />
              <p className="text-xs text-[#ff9f43]">
                Offline mode — visit will be saved locally and synced automatically when you reconnect. Photos cannot be attached offline.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Input label="Farmer Name *" placeholder="e.g. John Kamau" value={form.farmer_name} onChange={(e) => set("farmer_name", e.target.value)} />
            </div>
            <Input label="Farmer Phone" placeholder="+254 7XX XXX XXX" type="tel" value={form.farmer_phone} onChange={(e) => set("farmer_phone", e.target.value)} />
            <Input label="Farm / Plot Name" placeholder="e.g. Shamba ya Kilimani" value={form.farm_name} onChange={(e) => set("farm_name", e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Select label="County *" value={form.county} onChange={(e) => set("county", e.target.value)}>
              <option value="">Select county…</option>
              {KENYA_COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Input label="Sub-County / Ward" placeholder="e.g. Nakuru North" value={form.sub_county} onChange={(e) => set("sub_county", e.target.value)} />
          </div>

          {position && (
            <div className="flex items-center gap-2 px-3 py-2 bg-[#00c096]/10 border border-[#00c096]/20 rounded-xl">
              <MapPin size={12} className="text-[#00c096]" />
              <span className="text-xs text-[#00c096]">Farm GPS captured (±{Math.round(position.accuracy)}m)</span>
            </div>
          )}

          <CropSelector selected={form.crops} onChange={(v) => set("crops", v)} />

          <div className="grid grid-cols-3 gap-3">
            <Input label="Acreage" type="number" min="0" step="0.5" placeholder="2.5" value={form.acreage} onChange={(e) => set("acreage", e.target.value)} />
            <Select label="Unit" value={form.acreage_unit} onChange={(e) => set("acreage_unit", e.target.value)}>
              <option value="acres">Acres</option>
              <option value="hectares">Hectares</option>
            </Select>
            <Select label="Soil Type" value={form.soil_type} onChange={(e) => set("soil_type", e.target.value)}>
              <option value="">Unknown</option>
              {SOIL_TYPES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </Select>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <div onClick={() => set("irrigation", !form.irrigation)}
              className={`w-10 h-5 rounded-full transition-colors relative ${form.irrigation ? "bg-[#c8f230]" : "bg-[#21272f]"}`}>
              <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${form.irrigation ? "translate-x-5" : "translate-x-0.5"}`} />
            </div>
            <span className="text-sm text-[#c2cad4]">Irrigation system present</span>
          </label>

          <Textarea label="Current Inputs Used" placeholder="What agro-inputs does the farmer currently use?" rows={2} value={form.current_inputs} onChange={(e) => set("current_inputs", e.target.value)} />
          <Textarea label="Products Recommended" placeholder="Products/solutions you recommended" rows={2} value={form.products_recommended} onChange={(e) => set("products_recommended", e.target.value)} />
          <Textarea label="Products Sold" placeholder="Products actually sold / orders taken" rows={2} value={form.products_sold} onChange={(e) => set("products_sold", e.target.value)} />

          <div className="grid grid-cols-2 gap-3">
            <Select label="Visit Purpose *" value={form.visit_purpose} onChange={(e) => set("visit_purpose", e.target.value)}>
              {VISIT_PURPOSES.map((p) => <option key={p} value={p}>{p.replace(/_/g, " ")}</option>)}
            </Select>
            <Select label="Visit Outcome *" value={form.visit_outcome} onChange={(e) => set("visit_outcome", e.target.value)}>
              {VISIT_OUTCOMES.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
            </Select>
          </div>

          <Input label="Next Visit Date" type="date" value={form.next_visit_date} onChange={(e) => set("next_visit_date", e.target.value)} />
          <Textarea label="Field Notes" placeholder="Observations, issues, opportunities…" rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} />

          {/* Photos only when online */}
          {online && (
            <div>
              <label className="text-xs font-medium text-[#8b95a1] uppercase tracking-wider block mb-2">Farm Photos (max 4)</label>
              <button onClick={() => setCamOpen(true)} disabled={capturedPhotos.length >= 4}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#21272f] text-[#8b95a1] hover:text-white text-xs font-medium transition-colors disabled:opacity-40">
                <Camera size={13} /> Take Photo ({capturedPhotos.length}/4)
              </button>
              {capturedPhotos.length > 0 && (
                <div className="flex gap-2 mt-2 flex-wrap">
                  {capturedPhotos.map((p, i) => (
                    <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden border border-[#21272f]">
                      <img src={p.dataUrl} alt="" className="w-full h-full object-cover" />
                      <button onClick={() => setCapturedPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                        className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-[#ff4d4f] text-white flex items-center justify-center text-[10px]">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-5 border-t border-[#21272f] mt-5">
          <Btn variant="ghost" onClick={() => setShowCreate(false)} className="flex-1">Cancel</Btn>
          <Btn onClick={handleSubmit} disabled={createMut.isPending} className="flex-1">
            {createMut.isPending ? "Saving…" : online ? "Save Visit Record" : "Save Offline"}
          </Btn>
        </div>
      </Modal>

      {/* Visit detail */}
      {selected && (
        <Modal open={!!selected} onClose={() => setSelected(null)} title="Farm Visit Details" width="max-w-md">
          <div className="space-y-3 text-sm max-h-[70vh] overflow-y-auto">
            <div className="flex gap-2 flex-wrap">
              <Badge label={selected.visit_outcome?.replace(/_/g, " ")} color={OUTCOME_COLORS[selected.visit_outcome] ?? "default"} />
              <Badge label={selected.visit_purpose?.replace(/_/g, " ")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><p className="text-[#8b95a1] text-xs">Farmer</p><p className="text-white font-medium">{selected.farmer_name}</p></div>
              {selected.farm_name && <div><p className="text-[#8b95a1] text-xs">Farm</p><p className="text-white">{selected.farm_name}</p></div>}
              <div><p className="text-[#8b95a1] text-xs">County</p><p className="text-white">{selected.county}</p></div>
              {selected.acreage && <div><p className="text-[#8b95a1] text-xs">Acreage</p><p className="text-white">{selected.acreage} {selected.acreage_unit}</p></div>}
            </div>
            {Array.isArray(selected.crops) && selected.crops.length > 0 && (
              <div>
                <p className="text-[#8b95a1] text-xs mb-1">Crops</p>
                <div className="flex flex-wrap gap-1">{selected.crops.map((c) => <span key={c} className="text-[10px] bg-[#c8f230]/10 text-[#c8f230] px-1.5 py-0.5 rounded-md">{c}</span>)}</div>
              </div>
            )}
            {selected.products_sold && <div><p className="text-[#8b95a1] text-xs">Products Sold</p><p className="text-[#c2cad4]">{selected.products_sold}</p></div>}
            {selected.notes && <div><p className="text-[#8b95a1] text-xs">Notes</p><p className="text-[#c2cad4]">{selected.notes}</p></div>}
          </div>
          <div className="pt-4 border-t border-[#21272f] mt-4">
            <Btn variant="ghost" onClick={() => setSelected(null)} className="w-full">Close</Btn>
          </div>
        </Modal>
      )}

      <CameraCapture open={camOpen} onClose={() => setCamOpen(false)}
        onCapture={(p) => { setCapturedPhotos((prev) => [...prev, p]); setCamOpen(false); toast.success("Photo added!"); }}
        title="Farm Photo" facingMode="environment" />
    </div>
  );
}