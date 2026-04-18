// src/lib/reportExport.js
// Export engine: PDF, Excel, CSV for all FieldTrack reports

import { format, differenceInDays } from "date-fns";

// ─── FORMAT HELPERS ───────────────────────────────────────────────────────────
export function fmtKES(n) {
  return Number(n || 0).toLocaleString("en-KE");
}

export function fmtDate(d) {
  if (!d) return "-";
  try { return format(new Date(d), "dd MMM yyyy"); }
  catch { return String(d); }
}

export function fmtDateTime(d) {
  if (!d) return "-";
  try { return format(new Date(d), "dd MMM yyyy HH:mm"); }
  catch { return String(d); }
}

// ─── DOWNLOAD TRIGGER ─────────────────────────────────────────────────────────
function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

// ─── JSPDF LOADER ─────────────────────────────────────────────────────────────
let _jsPDFClass = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) { resolve(); return; }
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Failed to load: ${src}`));
    document.head.appendChild(s);
  });
}

async function getJsPDF() {
  if (_jsPDFClass) return _jsPDFClass;
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js");
  _jsPDFClass = window.jspdf?.jsPDF ?? window.jsPDF;
  if (!_jsPDFClass) throw new Error("jsPDF failed to initialize from CDN");
  return _jsPDFClass;
}

// ─── XLSX LOADER ──────────────────────────────────────────────────────────────
async function getXLSX() {
  try { return await import("xlsx"); }
  catch {
    return new Promise((resolve, reject) => {
      if (window.XLSX) return resolve(window.XLSX);
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      script.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error("XLSX not found"));
      script.onerror = () => reject(new Error("Failed to load XLSX"));
      document.head.appendChild(script);
    });
  }
}

// ─── CSV EXPORT ───────────────────────────────────────────────────────────────
export function exportCSV(data, headers, filename = "export.csv") {
  if (!data?.length) return;
  const csvRows = [
    headers.map((h) => `"${h.label}"`).join(","),
    ...data.map((row) =>
      headers.map((h) => {
        const val = typeof h.key === "function" ? h.key(row) : row[h.key];
        return `"${String(val ?? "").replace(/"/g, '""')}"`;
      }).join(",")
    ),
  ];
  const blob = new Blob(["\uFEFF" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  download(blob, filename);
}

// ─── EXCEL EXPORT ─────────────────────────────────────────────────────────────
export async function exportExcel(sheets, filename = "report.xlsx") {
  const XLSX = await getXLSX();
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const wsData = [
      sheet.headers.map((h) => h.label),
      ...sheet.data.map((row) =>
        sheet.headers.map((h) => {
          const val = typeof h.key === "function" ? h.key(row) : row[h.key];
          return val ?? "";
        })
      ),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = sheet.headers.map((h) => ({ wch: Math.max(h.label.length + 2, 16) }));
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.substring(0, 31));
  }
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  download(blob, filename);
}

// ─── BRAND COLORS ─────────────────────────────────────────────────────────────
const BRAND = {
  dark:   [10,  13,  15],
  card:   [17,  20,  24],
  accent: [200, 242, 48],
  white:  [255, 255, 255],
  muted:  [140, 149, 161],
  dim:    [74,  85,  104],
  green:  [0,   192, 150],
  amber:  [255, 159, 67],
  red:    [255, 77,  79],
  blue:   [59,  130, 246],
};

// ─── PDF EXPORT ───────────────────────────────────────────────────────────────
export async function exportPDF(config) {
  const JsPDF = await getJsPDF();
  const doc = new JsPDF({ orientation: config.landscape ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // Header bar
  doc.setFillColor(...BRAND.dark);
  doc.rect(0, 0, pageW, 34, "F");
  doc.setFillColor(...BRAND.accent);
  doc.rect(0, 0, 5, 34, "F");
  doc.setFillColor(...BRAND.card);
  doc.roundedRect(10, 6, 22, 22, 2, 2, "F");
  doc.setTextColor(...BRAND.accent);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("FT", 21, 19.5, { align: "center" });
  doc.setTextColor(...BRAND.accent);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("FieldTrack Kenya", 36, 14);
  doc.setTextColor(...BRAND.white);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(config.title, 36, 22);
  if (config.subtitle) {
    doc.setTextColor(...BRAND.muted);
    doc.setFontSize(7.5);
    doc.text(config.subtitle, 36, 29);
  }
  doc.setTextColor(...BRAND.muted);
  doc.setFontSize(7);
  doc.text(`Generated: ${fmtDateTime(new Date())}`, pageW - 10, 14, { align: "right" });
  doc.text("CONFIDENTIAL", pageW - 10, 21, { align: "right" });

  let yPos = 42;

  // Summary stats
  if (config.stats?.length) {
    const cols = config.stats.length;
    const statW = (pageW - 20) / cols;
    const statH = 20;
    config.stats.forEach((stat, i) => {
      const x = 10 + i * statW;
      doc.setFillColor(...BRAND.card);
      doc.roundedRect(x, yPos, statW - 2, statH, 2, 2, "F");
      doc.setFillColor(...(stat.accentColor ?? BRAND.accent));
      doc.roundedRect(x, yPos, statW - 2, 1, 0.5, 0.5, "F");
      doc.setTextColor(...BRAND.muted);
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");
      doc.text(stat.label.toUpperCase(), x + 3, yPos + 7);
      doc.setTextColor(...(stat.accentColor ?? BRAND.accent));
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(String(stat.value ?? "—"), x + 3, yPos + 15);
    });
    yPos += statH + 8;
  }

  // Section label
  if (config.sectionLabel) {
    doc.setFillColor(...BRAND.card);
    doc.rect(10, yPos, pageW - 20, 7, "F");
    doc.setFillColor(...BRAND.accent);
    doc.rect(10, yPos, 2, 7, "F");
    doc.setTextColor(...BRAND.accent);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.text(config.sectionLabel, 15, yPos + 5);
    yPos += 11;
  }

  // Data table
  if (config.table && config.table.data?.length) {
    const tableBody = config.table.data.map((row, idx) =>
      config.table.headers.map((h) => {
        const val = typeof h.key === "function" ? h.key(row, idx) : row[h.key];
        return val ?? "";
      })
    );
    doc.autoTable({
      head: [config.table.headers.map((h) => h.label)],
      body: tableBody,
      startY: yPos,
      margin: { left: 10, right: 10 },
      tableLineColor: BRAND.dim,
      tableLineWidth: 0.1,
      headStyles: { fillColor: BRAND.card, textColor: BRAND.accent, fontStyle: "bold", fontSize: 7.5, cellPadding: 3, lineColor: BRAND.dim, lineWidth: 0.1 },
      bodyStyles: { fillColor: [255, 255, 255], textColor: [30, 30, 30], fontSize: 7.5, cellPadding: 2.5, lineColor: [220, 225, 220], lineWidth: 0.1 },
      alternateRowStyles: { fillColor: [245, 248, 245] },
      columnStyles: config.columnStyles ?? {},
      willDrawCell: config.willDrawCell,
      didDrawPage: () => {
        doc.setFillColor(...BRAND.dark);
        doc.rect(0, 0, pageW, 10, "F");
        doc.setFillColor(...BRAND.accent);
        doc.rect(0, 0, 5, 10, "F");
        doc.setTextColor(...BRAND.muted);
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "normal");
        doc.text("FieldTrack Kenya — " + config.title, 10, 6.5);
      },
    });
  } else if (config.table) {
    doc.setTextColor(...BRAND.muted);
    doc.setFontSize(9);
    doc.text("No data available for this report.", 10, yPos + 10);
  }

  // Footer
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFillColor(...BRAND.dark);
    doc.rect(0, pageH - 10, pageW, 10, "F");
    doc.setFillColor(...BRAND.accent);
    doc.rect(0, pageH - 10, 5, 10, "F");
    doc.setTextColor(...BRAND.muted);
    doc.setFontSize(6.5);
    doc.text(`FieldTrack Kenya — Confidential  |  Page ${i} of ${pageCount}`, pageW / 2, pageH - 3.5, { align: "center" });
  }

  doc.save(config.filename || "report.pdf");
}

// ─── AGING BUCKET HELPER ──────────────────────────────────────────────────────
function getAgingBucket(orderDate) {
  const days = differenceInDays(new Date(), new Date(orderDate));
  if (days <= 30)  return { label: "0–30 days",   color: BRAND.green };
  if (days <= 60)  return { label: "31–60 days",  color: BRAND.accent };
  if (days <= 90)  return { label: "61–90 days",  color: BRAND.amber };
  return             { label: "90+ days",          color: BRAND.red };
}

// ─── ORDERS AGING / PAYMENT REPORT ───────────────────────────────────────────
export async function exportOrdersReport({ orders, payments = [], dateRange, fmt = "pdf" }) {
  // Build a map: orderId → { totalPaid, totalPending }
  const payMap = {};
  for (const p of payments) {
    if (!payMap[p.order]) payMap[p.order] = { totalPaid: 0, totalPending: 0, payments: [] };
    if (p.status === "approved") payMap[p.order].totalPaid += Number(p.amount || 0);
    if (p.status === "pending")  payMap[p.order].totalPending += Number(p.amount || 0);
    payMap[p.order].payments.push(p);
  }

  // Enrich orders with payment info
  const enriched = orders.map((o) => {
    const pm = payMap[o.id] ?? { totalPaid: 0, totalPending: 0, payments: [] };
    const orderAmt = Number(o.order_amount || 0);
    const balance  = orderAmt - pm.totalPaid;
    const pct      = orderAmt > 0 ? Math.min(100, Math.round((pm.totalPaid / orderAmt) * 100)) : 0;
    const aging    = o.status === "approved" && balance > 0
      ? getAgingBucket(o.submitted_at || o.order_date || o.created)
      : null;
    return { ...o, _totalPaid: pm.totalPaid, _totalPending: pm.totalPending, _balance: balance, _pct: pct, _aging: aging };
  });

  // ── CSV / EXCEL ──
  const headers = [
    { label: "Order No",        key: "order_no" },
    { label: "Date",            key: (r) => fmtDate(r.submitted_at || r.order_date) },
    { label: "Staff",           key: (r) => r.expand?.staff?.name ?? "—" },
    { label: "Customer",        key: "customer_name" },
    { label: "Phone",           key: (r) => r.customer_phone || "—" },
    { label: "Category",        key: "customer_category" },
    { label: "County",          key: (r) => r.county || "—" },
    { label: "Products",        key: (r) => r.product_description || "—" },
    { label: "Order Amount",    key: (r) => Number(r.order_amount || 0) },
    { label: "Status",          key: "status" },
    { label: "Paid (Approved)", key: (r) => r._totalPaid },
    { label: "Pending Payment", key: (r) => r._totalPending },
    { label: "Balance Due",     key: (r) => r._balance },
    { label: "% Paid",          key: (r) => `${r._pct}%` },
    { label: "Aging Bucket",    key: (r) => r._aging?.label ?? (r._balance <= 0 ? "PAID" : "—") },
    { label: "Notes",           key: (r) => r.notes || "—" },
  ];

  if (fmt === "csv") return exportCSV(enriched, headers, `orders-aging-${dateRange}.csv`);
  if (fmt === "excel") {
    // Two sheets: summary + aging
    const agingOrders = enriched.filter((o) => o.status === "approved" && o._balance > 0);
    return exportExcel([
      { name: "Orders", headers, data: enriched },
      {
        name: "Aging — Unpaid Balances",
        headers: headers.filter((h) => !["Products", "Notes", "Phone"].includes(h.label)),
        data: agingOrders.sort((a, b) => b._balance - a._balance),
      },
    ], `orders-aging-${dateRange}.xlsx`);
  }

  // ── PDF ──
  const approvedOrders  = enriched.filter((o) => o.status === "approved");
  const totalOrderValue = enriched.reduce((s, o) => s + Number(o.order_amount || 0), 0);
  const totalPaid       = approvedOrders.reduce((s, o) => s + o._totalPaid, 0);
  const totalPending    = approvedOrders.reduce((s, o) => s + o._totalPending, 0);
  const totalBalance    = approvedOrders.reduce((s, o) => s + Math.max(0, o._balance), 0);
  const fullyPaid       = approvedOrders.filter((o) => o._balance <= 0).length;

  // Aging buckets summary
  const agingBuckets = { "0–30 days": 0, "31–60 days": 0, "61–90 days": 0, "90+ days": 0 };
  for (const o of approvedOrders) {
    if (o._aging) agingBuckets[o._aging.label] = (agingBuckets[o._aging.label] || 0) + o._balance;
  }

  const JsPDF = await getJsPDF();
  const doc = new JsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // ── HEADER ──
  doc.setFillColor(...BRAND.dark);
  doc.rect(0, 0, pageW, 38, "F");
  doc.setFillColor(...BRAND.accent);
  doc.rect(0, 0, 5, 38, "F");
  doc.setFillColor(...BRAND.card);
  doc.roundedRect(10, 6, 26, 26, 2, 2, "F");
  doc.setTextColor(...BRAND.accent);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("FT", 23, 21, { align: "center" });
  doc.setFontSize(14);
  doc.text("FieldTrack Kenya", 42, 16);
  doc.setTextColor(...BRAND.white);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Orders — Payments & Aging Report", 42, 25);
  doc.setTextColor(...BRAND.muted);
  doc.setFontSize(7.5);
  doc.text(dateRange, 42, 33);
  doc.setFontSize(7);
  doc.text(`Generated: ${fmtDateTime(new Date())}`, pageW - 10, 16, { align: "right" });
  doc.text("CONFIDENTIAL", pageW - 10, 23, { align: "right" });

  let y = 46;

  // ── KPI STRIP ──
  const kpis = [
    { label: "TOTAL ORDERS",     value: enriched.length,              color: BRAND.accent },
    { label: "TOTAL ORDER VALUE",value: fmtKES(totalOrderValue),      color: BRAND.accent },
    { label: "TOTAL COLLECTED",  value: fmtKES(totalPaid),            color: BRAND.green  },
    { label: "PENDING APPROVAL", value: fmtKES(totalPending),         color: BRAND.amber  },
    { label: "OUTSTANDING BAL.", value: fmtKES(totalBalance),         color: BRAND.red    },
    { label: "FULLY PAID",       value: `${fullyPaid} orders`,        color: BRAND.green  },
    { label: "COLLECTION RATE",  value: totalOrderValue > 0 ? `${Math.round((totalPaid / totalOrderValue) * 100)}%` : "0%", color: BRAND.accent },
  ];
  const kpiW = (pageW - 20) / kpis.length;
  kpis.forEach((k, i) => {
    const x = 10 + i * kpiW;
    doc.setFillColor(...BRAND.card);
    doc.roundedRect(x, y, kpiW - 2, 18, 2, 2, "F");
    doc.setFillColor(...k.color);
    doc.roundedRect(x, y, kpiW - 2, 1, 0.5, 0.5, "F");
    doc.setTextColor(...BRAND.muted);
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "normal");
    doc.text(k.label, x + 2.5, y + 6.5);
    doc.setTextColor(...k.color);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(String(k.value), x + 2.5, y + 14);
  });
  y += 24;

  // ── AGING SUMMARY BAR ──
  doc.setFillColor(...BRAND.card);
  doc.roundedRect(10, y, pageW - 20, 16, 2, 2, "F");
  doc.setTextColor(...BRAND.muted);
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.text("OUTSTANDING BALANCE AGING", 14, y + 6);
  const agingEntries = Object.entries(agingBuckets);
  const agingW = (pageW - 60) / agingEntries.length;
  const agingColors = [BRAND.green, BRAND.accent, BRAND.amber, BRAND.red];
  agingEntries.forEach(([label, val], i) => {
    const x = 55 + i * agingW;
    doc.setFillColor(...agingColors[i]);
    doc.roundedRect(x, y + 3, agingW - 4, 10, 1, 1, "F");
    doc.setTextColor(...BRAND.dark);
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "bold");
    doc.text(label, x + (agingW - 4) / 2, y + 8, { align: "center" });
    doc.text(`KES ${fmtKES(val)}`, x + (agingW - 4) / 2, y + 12, { align: "center" });
  });
  y += 22;

  // ── MAIN TABLE ──
  const pdfHeaders = [
    { label: "Order No",     key: "order_no" },
    { label: "Date",         key: (r) => fmtDate(r.submitted_at || r.order_date) },
    { label: "Staff",        key: (r) => r.expand?.staff?.name ?? "—" },
    { label: "Customer",     key: "customer_name" },
    { label: "Category",     key: "customer_category" },
    { label: "County",       key: (r) => r.county || "—" },
    { label: "Order Amt",    key: (r) => fmtKES(r.order_amount) },
    { label: "Status",       key: "status" },
    { label: "Paid (Appr.)", key: (r) => r._totalPaid > 0 ? fmtKES(r._totalPaid) : "—" },
    { label: "Pending",      key: (r) => r._totalPending > 0 ? fmtKES(r._totalPending) : "—" },
    { label: "Balance",      key: (r) => r._balance <= 0 ? "PAID ✓" : fmtKES(r._balance) },
    { label: "% Paid",       key: (r) => `${r._pct}%` },
    { label: "Aging",        key: (r) => r._aging?.label ?? (r._balance <= 0 ? "PAID ✓" : "—") },
  ];

  const tableBody = enriched.map((row) =>
    pdfHeaders.map((h) => typeof h.key === "function" ? h.key(row) : row[h.key] ?? "")
  );

  doc.autoTable({
    head: [pdfHeaders.map((h) => h.label)],
    body: tableBody,
    startY: y,
    margin: { left: 10, right: 10 },
    tableLineColor: BRAND.dim,
    tableLineWidth: 0.1,
    headStyles: {
      fillColor: BRAND.card,
      textColor: BRAND.accent,
      fontStyle: "bold",
      fontSize: 7,
      cellPadding: 2.5,
      lineColor: BRAND.dim,
      lineWidth: 0.1,
    },
    bodyStyles: {
      fillColor: [255, 255, 255],
      textColor: [30, 30, 30],
      fontSize: 7,
      cellPadding: 2.2,
      lineColor: [220, 225, 220],
      lineWidth: 0.1,
    },
    alternateRowStyles: { fillColor: [246, 249, 246] },
    columnStyles: {
      0:  { cellWidth: 26 },  // Order No
      1:  { cellWidth: 20 },  // Date
      2:  { cellWidth: 22 },  // Staff
      3:  { cellWidth: 30 },  // Customer
      4:  { cellWidth: 18 },  // Category
      5:  { cellWidth: 18 },  // County
      6:  { cellWidth: 20, halign: "right" },  // Order Amt
      7:  { cellWidth: 18 },  // Status
      8:  { cellWidth: 20, halign: "right" },  // Paid
      9:  { cellWidth: 20, halign: "right" },  // Pending
      10: { cellWidth: 20, halign: "right" },  // Balance
      11: { cellWidth: 12, halign: "center" }, // % Paid
      12: { cellWidth: 20 },  // Aging
    },
    willDrawCell: (data) => {
      if (data.section === "body") {
        const row = enriched[data.row.index];
        if (!row) return;
        // Color the Balance cell
        if (data.column.index === 10) {
          if (row._balance <= 0) {
            data.cell.styles.textColor = BRAND.green;
            data.cell.styles.fontStyle = "bold";
          } else if (row._aging?.label === "90+ days") {
            data.cell.styles.textColor = BRAND.red;
            data.cell.styles.fontStyle = "bold";
          } else if (row._aging?.label === "61–90 days") {
            data.cell.styles.textColor = BRAND.amber;
          }
        }
        // Color the % Paid cell
        if (data.column.index === 11) {
          if (row._pct >= 100) data.cell.styles.textColor = BRAND.green;
          else if (row._pct >= 50) data.cell.styles.textColor = BRAND.amber;
          else if (row._pct > 0)   data.cell.styles.textColor = BRAND.red;
        }
        // Color the Aging cell
        if (data.column.index === 12 && row._aging) {
          data.cell.styles.textColor = row._aging.color;
          data.cell.styles.fontStyle = "bold";
        }
        // Color status cell
        if (data.column.index === 7) {
          if (row.status === "approved")         data.cell.styles.textColor = BRAND.green;
          else if (row.status === "rejected")    data.cell.styles.textColor = BRAND.red;
          else if (row.status === "pending_approval") data.cell.styles.textColor = BRAND.amber;
        }
      }
    },
    didDrawPage: () => {
      doc.setFillColor(...BRAND.dark);
      doc.rect(0, 0, pageW, 10, "F");
      doc.setFillColor(...BRAND.accent);
      doc.rect(0, 0, 5, 10, "F");
      doc.setTextColor(...BRAND.muted);
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");
      doc.text("FieldTrack Kenya — Orders Payments & Aging Report", 10, 6.5);
    },
  });

  // ── FOOTER ──
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFillColor(...BRAND.dark);
    doc.rect(0, pageH - 10, pageW, 10, "F");
    doc.setFillColor(...BRAND.accent);
    doc.rect(0, pageH - 10, 5, 10, "F");
    doc.setTextColor(...BRAND.muted);
    doc.setFontSize(6.5);
    doc.text(`FieldTrack Kenya — Confidential  |  Page ${i} of ${pageCount}`, pageW / 2, pageH - 3.5, { align: "center" });
  }

  doc.save(`orders-aging-${dateRange}.pdf`);
}

// ─── SALES PERFORMANCE REPORT ─────────────────────────────────────────────────
export async function exportSalesReport({ leaderboard, month, format: fmt = "pdf" }) {
  const headers = [
    { label: "#",          key: (_, i) => i + 1 },
    { label: "Staff Name", key: "staffName" },
    { label: "County",     key: "county" },
    { label: "Orders",     key: "totalOrders" },
    { label: "Target",     key: (r) => Number(r.targetAmount || 0) },
    { label: "Achieved",   key: (r) => Number(r.achievedAmount || 0) },
    { label: "% Achieved", key: (r) => `${r.pct}%` },
    { label: "Gap",        key: (r) => r.gap > 0 ? Number(r.gap || 0) : "✅ HIT" },
  ];
  const pdfHeaders = [
    { label: "#",          key: (_, i) => i + 1 },
    { label: "Staff Name", key: "staffName" },
    { label: "County",     key: "county" },
    { label: "Orders",     key: "totalOrders" },
    { label: "Target",     key: (r) => fmtKES(r.targetAmount) },
    { label: "Achieved",   key: (r) => fmtKES(r.achievedAmount) },
    { label: "% Achieved", key: (r) => `${r.pct}%` },
    { label: "Gap",        key: (r) => r.gap > 0 ? fmtKES(r.gap) : "✅ HIT" },
  ];
  const totalAchieved = leaderboard.reduce((s, r) => s + r.achievedAmount, 0);
  const totalTarget   = leaderboard.reduce((s, r) => s + r.targetAmount, 0);
  const avgPct = leaderboard.length ? Math.round(leaderboard.reduce((s, r) => s + r.pct, 0) / leaderboard.length) : 0;
  if (fmt === "csv") return exportCSV(leaderboard, headers, `sales-${month}.csv`);
  if (fmt === "excel") return exportExcel([{ name: "Sales Performance", headers, data: leaderboard }], `sales-${month}.xlsx`);
  return exportPDF({
    title: `Sales Performance Report — ${month}`,
    subtitle: `Month: ${month}  |  ${leaderboard.length} staff members`,
    landscape: true,
    stats: [
      { label: "Total Achieved", value: fmtKES(totalAchieved) },
      { label: "Total Target",   value: fmtKES(totalTarget) },
      { label: "Team Average %", value: `${avgPct}%` },
      { label: "Staff Count",    value: leaderboard.length },
      { label: "Target Hitters", value: leaderboard.filter((r) => r.pct >= 100).length },
    ],
    table: { headers: pdfHeaders, data: leaderboard },
    filename: `sales-performance-${month}.pdf`,
  });
}

// ─── FARMER VISITS REPORT ─────────────────────────────────────────────────────
export async function exportFarmerVisitsReport({ visits, dateRange, fmt = "pdf" }) {
  const headers = [
    { label: "Staff",          key: (r) => r.expand?.staff?.name ?? "—" },
    { label: "Farmer",         key: "farmer_name" },
    { label: "Phone",          key: (r) => r.farmer_phone || "—" },
    { label: "Farm",           key: (r) => r.farm_name || "—" },
    { label: "County",         key: "county" },
    { label: "Sub-County",     key: (r) => r.sub_county || "—" },
    { label: "Ward",           key: (r) => r.ward || "—" },
    { label: "GPS Lat",        key: (r) => r.gps_lat || "—" },
    { label: "GPS Lng",        key: (r) => r.gps_lng || "—" },
    { label: "Crops",          key: (r) => (Array.isArray(r.crops) ? r.crops.join(", ") : r.crops || "—") },
    { label: "Acreage",        key: (r) => r.acreage ? `${r.acreage} ${r.acreage_unit || "acres"}` : "—" },
    { label: "Soil Type",      key: (r) => r.soil_type?.replace(/_/g, " ") || "—" },
    { label: "Irrigation",     key: (r) => r.irrigation ? "Yes" : "No" },
    { label: "Current Inputs", key: (r) => r.current_inputs || "—" },
    { label: "Recommended",    key: (r) => r.products_recommended || "—" },
    { label: "Products Sold",  key: (r) => r.products_sold || "—" },
    { label: "Purpose",        key: (r) => r.visit_purpose?.replace(/_/g, " ") || "—" },
    { label: "Outcome",        key: (r) => r.visit_outcome?.replace(/_/g, " ") || "—" },
    { label: "Next Visit",     key: (r) => r.next_visit_date || "—" },
    { label: "Notes",          key: (r) => r.notes || "—" },
  ];
  if (fmt === "csv") return exportCSV(visits, headers, `farm-visits-${dateRange}.csv`);
  if (fmt === "excel") return exportExcel([{ name: "Farmer Visits", headers, data: visits }], `farm-visits-${dateRange}.xlsx`);
  const counties   = [...new Set(visits.map((v) => v.county).filter(Boolean))];
  const totalAcres = visits.reduce((s, v) => s + Number(v.acreage || 0), 0);
  const converted  = visits.filter((v) => v.visit_outcome === "purchased").length;
  const pdfHeaders = [
    { label: "Staff",      key: (r) => r.expand?.staff?.name ?? "—" },
    { label: "Farmer",     key: "farmer_name" },
    { label: "Phone",      key: (r) => r.farmer_phone || "—" },
    { label: "Farm",       key: (r) => r.farm_name || "—" },
    { label: "County",     key: "county" },
    { label: "Sub-County", key: (r) => r.sub_county || "—" },
    { label: "Crops",      key: (r) => (Array.isArray(r.crops) ? r.crops.join(", ") : r.crops || "—") },
    { label: "Acreage",    key: (r) => r.acreage ? `${r.acreage} ${r.acreage_unit || "ac"}` : "—" },
    { label: "Soil",       key: (r) => r.soil_type?.replace(/_/g, " ") || "—" },
    { label: "Irrigation", key: (r) => r.irrigation ? "Yes" : "No" },
    { label: "Purpose",    key: (r) => r.visit_purpose?.replace(/_/g, " ") || "—" },
    { label: "Outcome",    key: (r) => r.visit_outcome?.replace(/_/g, " ") || "—" },
    { label: "Sold",       key: (r) => r.products_sold || "—" },
    { label: "Next Visit", key: (r) => r.next_visit_date || "—" },
  ];
  return exportPDF({
    title: "Farmer Visits Report",
    subtitle: dateRange,
    landscape: true,
    stats: [
      { label: "Total Visits",   value: visits.length },
      { label: "Total Acreage",  value: `${totalAcres.toFixed(1)} acres` },
      { label: "Counties",       value: counties.length },
      { label: "Converted",      value: converted },
      { label: "Not Interested", value: visits.filter((v) => v.visit_outcome === "not_interested").length },
    ],
    table: { headers: pdfHeaders, data: visits },
    filename: `farmer-visits-${dateRange}.pdf`,
  });
}

// ─── LEADERBOARD REPORT ───────────────────────────────────────────────────────
export async function exportLeaderboardReport({ leaderboard, month, fmt = "pdf" }) {
  const headers = [
    { label: "#",           key: (_, i) => i + 1 },
    { label: "Staff",       key: "staffName" },
    { label: "County",      key: "county" },
    { label: "Orders",      key: "totalOrders" },
    { label: "Target",      key: (r) => Number(r.targetAmount || 0) },
    { label: "Achieved",    key: (r) => Number(r.achievedAmount || 0) },
    { label: "% Hit",       key: (r) => `${r.pct}%` },
    { label: "Gap",         key: (r) => r.gap > 0 ? Number(r.gap || 0) : "✅ DONE" },
    { label: "Distributor", key: (r) => Number(r.byCategory?.distributor || 0) },
    { label: "Stockist",    key: (r) => Number(r.byCategory?.stockist || 0) },
    { label: "Agrovet",     key: (r) => Number(r.byCategory?.agrovet || 0) },
    { label: "Farmer",      key: (r) => Number(r.byCategory?.farmer || 0) },
  ];
  const pdfHeaders = [
    { label: "#",           key: (_, i) => i + 1 },
    { label: "Staff",       key: "staffName" },
    { label: "County",      key: "county" },
    { label: "Orders",      key: "totalOrders" },
    { label: "Target",      key: (r) => fmtKES(r.targetAmount) },
    { label: "Achieved",    key: (r) => fmtKES(r.achievedAmount) },
    { label: "% Hit",       key: (r) => `${r.pct}%` },
    { label: "Gap",         key: (r) => r.gap > 0 ? fmtKES(r.gap) : "HIT" },
    { label: "Distributor", key: (r) => fmtKES(r.byCategory?.distributor) },
    { label: "Stockist",    key: (r) => fmtKES(r.byCategory?.stockist) },
    { label: "Agrovet",     key: (r) => fmtKES(r.byCategory?.agrovet) },
    { label: "Farmer",      key: (r) => fmtKES(r.byCategory?.farmer) },
  ];
  if (fmt === "csv") return exportCSV(leaderboard, headers, `leaderboard-${month}.csv`);
  if (fmt === "excel") return exportExcel([{ name: "Leaderboard", headers, data: leaderboard }], `leaderboard-${month}.xlsx`);
  const totalAchieved = leaderboard.reduce((s, r) => s + r.achievedAmount, 0);
  const totalTarget   = leaderboard.reduce((s, r) => s + r.targetAmount, 0);
  const teamPct = totalTarget > 0 ? Math.round((totalAchieved / totalTarget) * 100) : 0;
  return exportPDF({
    title: `Sales Leaderboard — ${month}`,
    subtitle: `Live rankings as of ${fmtDateTime(new Date())}`,
    landscape: true,
    stats: [
      { label: "Staff Ranked",   value: leaderboard.length },
      { label: "Total Achieved", value: fmtKES(totalAchieved) },
      { label: "Total Target",   value: fmtKES(totalTarget) },
      { label: "Team %",         value: `${teamPct}%` },
      { label: "Hitting Target", value: leaderboard.filter((r) => r.pct >= 100).length },
    ],
    table: { headers: pdfHeaders, data: leaderboard },
    filename: `leaderboard-${month}.pdf`,
  });
}

// ─── ATTENDANCE REPORT ────────────────────────────────────────────────────────
export async function exportAttendanceReport(data, dateRange, fmt) {
  const headers = [
    { label: "Date",      key: "date" },
    { label: "Staff",     key: (r) => r.expand?.user?.name ?? "—" },
    { label: "Clock In",  key: (r) => { try { return r.clock_in ? format(new Date(r.clock_in), "HH:mm") : "—"; } catch { return "—"; } } },
    { label: "Clock Out", key: (r) => { try { return r.clock_out ? format(new Date(r.clock_out), "HH:mm") : "Active"; } catch { return "Active"; } } },
    { label: "Hours",     key: (r) => r.total_hours ? Number(Number(r.total_hours).toFixed(1)) : "—" },
    { label: "Status",    key: (r) => r.status || "—" },
    { label: "GPS Lat",   key: (r) => r.clock_in_lat || r.gps_lat || "—" },
    { label: "GPS Lng",   key: (r) => r.clock_in_lng || r.gps_lng || "—" },
    { label: "Location",  key: (r) => r.location || r.clock_in_location || "—" },
    { label: "Notes",     key: (r) => r.notes || "—" },
  ];
  if (fmt === "csv") return exportCSV(data, headers, `attendance-${dateRange}.csv`);
  if (fmt === "excel") return exportExcel([{ name: "Attendance", headers, data }], `attendance-${dateRange}.xlsx`);
  const totalHours = data.reduce((s, r) => s + Number(r.total_hours || 0), 0);
  const avgHours   = data.length ? totalHours / data.length : 0;
  const pdfHeaders = [
    { label: "Date",      key: "date" },
    { label: "Staff",     key: (r) => r.expand?.user?.name ?? "—" },
    { label: "Clock In",  key: (r) => { try { return r.clock_in ? format(new Date(r.clock_in), "HH:mm") : "—"; } catch { return "—"; } } },
    { label: "Clock Out", key: (r) => { try { return r.clock_out ? format(new Date(r.clock_out), "HH:mm") : "Active"; } catch { return "Active"; } } },
    { label: "Hours",     key: (r) => r.total_hours ? `${Number(r.total_hours).toFixed(1)}h` : "—" },
    { label: "Status",    key: (r) => r.status || "—" },
    { label: "GPS Lat",   key: (r) => r.clock_in_lat || r.gps_lat || "—" },
    { label: "GPS Lng",   key: (r) => r.clock_in_lng || r.gps_lng || "—" },
    { label: "Location",  key: (r) => r.location || r.clock_in_location || "—" },
  ];
  return exportPDF({
    title: "Attendance & Hours Report",
    subtitle: dateRange,
    landscape: true,
    stats: [
      { label: "Records",     value: data.length },
      { label: "Total Hours", value: `${totalHours.toFixed(1)}h` },
      { label: "Avg Hours",   value: `${avgHours.toFixed(1)}h` },
      { label: "On Time",     value: data.filter((r) => r.status === "on_time").length },
      { label: "Late",        value: data.filter((r) => r.status === "late").length },
    ],
    table: { headers: pdfHeaders, data },
    filename: `attendance-${dateRange}.pdf`,
  });
}

// ─── EXPENSES REPORT ──────────────────────────────────────────────────────────
export async function exportExpensesReport(data, dateRange, fmt) {
  const headers = [
    { label: "Date",           key: (r) => fmtDate(r.expense_date || r.created) },
    { label: "Staff",          key: (r) => r.expand?.submitted_by?.name ?? "—" },
    { label: "Type",           key: (r) => r.expense_type || "—" },
    { label: "Description",    key: (r) => r.description || "—" },
    { label: "Amount",         key: (r) => Number(r.amount || 0) },
    { label: "Currency",       key: (r) => r.currency || "KES" },
    { label: "Status",         key: (r) => r.status || "—" },
    { label: "Approved By",    key: (r) => r.expand?.approved_by?.name ?? "—" },
    { label: "Rejection Note", key: (r) => r.rejection_reason || "—" },
  ];
  const pdfHeaders = [
    { label: "Date",           key: (r) => fmtDate(r.expense_date || r.created) },
    { label: "Staff",          key: (r) => r.expand?.submitted_by?.name ?? "—" },
    { label: "Type",           key: (r) => r.expense_type || "—" },
    { label: "Description",    key: (r) => r.description || "—" },
    { label: "Amount",         key: (r) => fmtKES(r.amount) },
    { label: "Currency",       key: (r) => r.currency || "KES" },
    { label: "Status",         key: (r) => r.status || "—" },
    { label: "Approved By",    key: (r) => r.expand?.approved_by?.name ?? "—" },
    { label: "Rejection Note", key: (r) => r.rejection_reason || "—" },
  ];
  if (fmt === "csv") return exportCSV(data, headers, `expenses-${dateRange}.csv`);
  if (fmt === "excel") return exportExcel([{ name: "Expenses", headers, data }], `expenses-${dateRange}.xlsx`);
  const approved  = data.filter((e) => e.status === "approved");
  const rejected  = data.filter((e) => e.status === "rejected");
  const pending   = data.filter((e) => e.status === "pending");
  const paid      = data.filter((e) => e.status === "paid");
  const approvedAmt = approved.reduce((s, e) => s + Number(e.amount || 0), 0);
  const rejectedAmt = rejected.reduce((s, e) => s + Number(e.amount || 0), 0);
  const paidAmt     = paid.reduce((s, e) => s + Number(e.amount || 0), 0);
  const totalAmt    = data.reduce((s, e) => s + Number(e.amount || 0), 0);
  return exportPDF({
    title: "Expenses & Mileage Report",
    subtitle: dateRange,
    landscape: true,
    stats: [
      { label: "Total Claims", value: `${data.length} — ${fmtKES(totalAmt)}` },
      { label: "Approved",     value: `${approved.length} — ${fmtKES(approvedAmt)}` },
      { label: "Rejected",     value: `${rejected.length} — ${fmtKES(rejectedAmt)}` },
      { label: "Paid",         value: `${paid.length} — ${fmtKES(paidAmt)}` },
      { label: "Pending",      value: pending.length },
    ],
    table: { headers: pdfHeaders, data },
    filename: `expenses-${dateRange}.pdf`,
  });
}

// ─── WHATSAPP SHARE ───────────────────────────────────────────────────────────
export function shareViaWhatsApp(text) {
  const encoded = encodeURIComponent(text);
  window.open(`https://wa.me/?text=${encoded}`, "_blank");
}

export function buildLeaderboardShareText(leaderboard, month) {
  const lines = [
    `🏆 *FieldTrack Sales Leaderboard — ${month}*`,
    `Generated: ${fmtDateTime(new Date())}`,
    ``,
  ];
  leaderboard.slice(0, 10).forEach((r, i) => {
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
    const bar   = r.pct >= 100 ? "✅" : r.pct >= 70 ? "🟡" : "🔴";
    lines.push(`${medal} ${r.staffName} — ${fmtKES(r.achievedAmount)} (${r.pct}%) ${bar}`);
  });
  lines.push(``, `_Powered by FieldTrack Kenya_`);
  return lines.join("\n");
}