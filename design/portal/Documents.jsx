/* Documents screen. */
function Documents() {
  const P = window.PORTAL;
  const iconOf = { Confirmation: "file-check", Compliance: "shield-check", Statement: "file-text", "Term Sheet": "file-signature", Report: "file-bar-chart" };
  return (
    <div className="screen-wrap">
      <Eyebrow>Documents</Eyebrow>
      <h1 className="page-title">Documents & records</h1>
      <p className="page-sub">Subscription confirmations, compliance records, and AIFMD investor reports. Generated automatically and retained per CSSF requirements.</p>

      <div className="card" style={{ marginTop: 26, overflow: "hidden" }}>
        {P.documents.map((d, i) => (
          <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 20px", borderTop: i ? "1px solid var(--border)" : "none", cursor: "pointer", transition: "background .15s" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--parch-100)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
            <div style={{ width: 38, height: 38, borderRadius: "var(--r-sm)", background: "var(--parch-dark)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--clavis-navy)", flexShrink: 0 }}>
              <Icon name={iconOf[d.kind] || "file"} size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--clavis-navy)" }}>{d.name}</div>
              <div className="mono" style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 3 }}>{d.date} · {d.size} · {d.instrument}</div>
            </div>
            <span className="chip neutral">{d.kind}</span>
            <button style={{ color: "var(--slate)", padding: 6 }}><Icon name="download" size={17} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
window.Documents = Documents;
