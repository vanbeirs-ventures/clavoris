/* Portfolio dashboard screen. */
function Portfolio({ onOpenInstrument, investor }) {
  const P = window.PORTAL;
  const gain = P.totalValue - P.totalInvested;
  const gainPct = ((gain / P.totalInvested) * 100).toFixed(2);

  return (
    <div className="screen-wrap">
      <Eyebrow>Portfolio</Eyebrow>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 className="page-title">Good morning, {investor.name.split(" ")[0]}.</h1>
          <p className="page-sub">{investor.category} · {investor.entity}</p>
        </div>
        <button className="btn btn-ghost" onClick={() => onOpenInstrument(null)}><Icon name="plus" size={15} /> Browse instruments</button>
      </div>

      {/* metric band */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginTop: 28 }}>
        <div className="card" style={tileSt}><StatPair k="Total Holdings Value" v={P.fmtEur(P.totalValue)} sub={`+${P.fmtEur(gain)} · +${gainPct}%`} /></div>
        <div className="card" style={tileSt}><StatPair k="Active Instruments" v={String(P.holdings.length)} sub="3 bonds · 1 SICAV" /></div>
        <div className="card" style={tileSt}><StatPair k="Next Coupon" v="30 Jun 2026" sub="Real Estate Bond II · 6.50%" accent /></div>
        <div className="card" style={tileSt}><StatPair k="Settlement" v="T+0" sub="EURC · Canton Network" /></div>
      </div>

      {/* holdings */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 40, marginBottom: 14 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--clavis-navy)" }}>Your holdings</h2>
        <span style={{ fontSize: 12, color: "var(--fg-3)" }}>4 instruments · custody via Clearstream + Fireblocks</span>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--parch-100)" }}>
              {["Instrument", "Theme", "Coupon", "Maturity", "Invested", "Value", "Status"].map((h, i) => (
                <th key={h} style={{ ...thSt, textAlign: i >= 2 && i <= 5 ? "right" : "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {P.holdings.map((h, idx) => (
              <tr key={h.isin} onClick={() => onOpenInstrument(h.isin)}
                style={{ cursor: "pointer", borderTop: "1px solid var(--border)", transition: "background .15s" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--parch-100)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                <td style={tdSt}>
                  <div style={{ fontWeight: 500, color: "var(--clavis-navy)", fontSize: 13.5 }}>{h.name}</div>
                  <div className="mono" style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 3 }}>{h.isin} · {h.type}</div>
                </td>
                <td style={tdSt}><Chip kind={P.themeOf[h.theme]}>{h.theme}</Chip></td>
                <td className="mono" style={{ ...tdSt, textAlign: "right" }}>{h.coupon ? h.coupon.toFixed(2) + "%" : "—"}</td>
                <td className="mono" style={{ ...tdSt, textAlign: "right", color: "var(--fg-2)" }}>{h.maturity}</td>
                <td className="mono" style={{ ...tdSt, textAlign: "right", color: "var(--fg-2)" }}>{P.fmtEur(h.invested)}</td>
                <td className="mono" style={{ ...tdSt, textAlign: "right", color: "var(--clavis-navy)", fontSize: 13.5 }}>{P.fmtEur(h.value)}</td>
                <td style={{ ...tdSt, textAlign: "left" }}>
                  {h.status === "settled" ? <Chip kind="verified">Settled</Chip> : <Chip kind="pending">Pending</Chip>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 10.5, color: "var(--fg-3)", marginTop: 16, lineHeight: 1.5, maxWidth: 700 }}>
        Valuations are indicative and subject to AIFMD-compliant NAV calculation. Past performance is not a reliable indicator of future
        results. Instruments are available exclusively to professional investors under MiFID II categorisation.
      </p>
    </div>
  );
}

const tileSt = { padding: "16px 18px" };
const thSt = { padding: "11px 16px", fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--fg-3)" };
const tdSt = { padding: "13px 16px", fontSize: 13, verticalAlign: "middle" };

window.Portfolio = Portfolio;
