/* Instruments marketplace — browse + filter. */
const { useState: useMktState } = React;

function InstrumentTile({ inst, onOpen }) {
  const P = window.PORTAL;
  return (
    <div className="card" style={{ overflow: "hidden", display: "flex", flexDirection: "column", transition: "box-shadow .2s, transform .2s", cursor: "pointer" }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "var(--shadow-md)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "var(--shadow-sm)"; e.currentTarget.style.transform = "none"; }}
      onClick={() => onOpen(inst.isin)}>
      <div style={{ background: "var(--clavis-navy)", padding: "15px 18px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 18.5, color: "var(--parchment)", lineHeight: 1.18 }}>{inst.name}</div>
          <div className="mono" style={{ fontSize: 10.5, color: "var(--fg-on-navy-2)", marginTop: 5 }}>{inst.isin}</div>
        </div>
        {inst.status === "closing"
          ? <span className="chip pending" style={{ flexShrink: 0 }}>Closing</span>
          : <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--gold-light)", border: "1px solid rgba(212,168,42,.5)", borderRadius: 3, padding: "3px 7px" }}>Open</span>}
      </div>
      <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 0 }}>
        {[["Coupon", inst.coupon ? inst.coupon.toFixed(2) + "%" : "NAV-linked"], ["Maturity", inst.maturity], ["Structure", inst.structure], ["Programme size", inst.size]].map(([k, v], i) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: i < 3 ? "1px solid var(--border)" : "none" }}>
            <span style={{ fontSize: 11.5, color: "var(--fg-2)" }}>{k}</span>
            <span className="mono" style={{ fontSize: 12, color: "var(--clavis-navy)" }}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: "auto", padding: "13px 18px", background: "var(--parch-100)", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--fg-3)" }}>Min. investment</div>
          <div className="mono" style={{ fontSize: 15, color: "var(--clavis-navy)", marginTop: 2 }}>{P.fmtEur(inst.min)}</div>
        </div>
        <span className="chip" style={{ background: "var(--parch-dark)", color: "var(--slate)", borderColor: "var(--border)" }}>{inst.theme}</span>
      </div>
    </div>
  );
}

function Marketplace({ onOpen }) {
  const P = window.PORTAL;
  const themes = ["All", "Real Estate", "Energy", "Luxury", "Multi-asset"];
  const [filter, setFilter] = useMktState("All");
  const list = filter === "All" ? P.marketplace : P.marketplace.filter((m) => m.theme === filter);

  return (
    <div className="screen-wrap">
      <Eyebrow>Instruments</Eyebrow>
      <h1 className="page-title">Marketplace</h1>
      <p className="page-sub">Van Beirs Finance SA private instruments, available for subscription. Every instrument is tokenised on Canton Network and settles T+0 in EURC.</p>

      <div style={{ display: "flex", gap: 9, marginTop: 24, flexWrap: "wrap", alignItems: "center" }}>
        {themes.map((t) => (
          <button key={t} onClick={() => setFilter(t)}
            style={{ fontSize: 12.5, fontWeight: 500, padding: "7px 15px", borderRadius: "var(--r-pill)",
              border: "1px solid " + (filter === t ? "var(--clavis-navy)" : "var(--border-strong)"),
              background: filter === t ? "var(--clavis-navy)" : "transparent",
              color: filter === t ? "var(--parchment)" : "var(--slate)", transition: "all .15s" }}>{t}</button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--fg-3)" }}>{list.length} instruments</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 18, marginTop: 22 }}>
        {list.map((inst) => <InstrumentTile key={inst.isin} inst={inst} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

window.Marketplace = Marketplace;
window.InstrumentTile = InstrumentTile;
