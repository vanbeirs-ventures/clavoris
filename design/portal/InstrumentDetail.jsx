/* Instrument detail + subscribe modal. */
const { useState: useDetState } = React;

function SubscribeModal({ inst, onClose }) {
  const P = window.PORTAL;
  const [stage, setStage] = useDetState("form"); // form -> confirm -> done
  const [amount, setAmount] = useDetState(inst.min || 100000);

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ background: "var(--clavis-navy)", padding: "18px 22px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--gold-light)", fontWeight: 600 }}>Subscribe</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 17, color: "var(--parchment)", marginTop: 3 }}>{inst.name}</div>
          </div>
          <button onClick={onClose} style={{ color: "var(--fg-on-navy-2)" }}><Icon name="x" size={18} /></button>
        </div>

        {stage === "form" && (
          <div style={{ padding: 22 }}>
            <label style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--fg-2)" }}>Investment amount (EUR)</label>
            <div style={{ display: "flex", alignItems: "center", border: "1px solid var(--border-strong)", borderRadius: "var(--r-sm)", marginTop: 8, padding: "2px 12px" }}>
              <span className="mono" style={{ color: "var(--fg-3)", fontSize: 16 }}>€</span>
              <input className="mono" value={Number(amount).toLocaleString("en-GB")} onChange={(e) => setAmount(Number(e.target.value.replace(/\D/g, "")) || 0)}
                style={{ flex: 1, border: "none", outline: "none", fontSize: 16, padding: "11px 8px", color: "var(--clavis-navy)" }} />
            </div>
            <div style={{ fontSize: 11, color: amount < inst.min ? "var(--status-alert)" : "var(--fg-3)", marginTop: 7 }}>
              {amount < inst.min ? `Below MiFID II minimum of ${P.fmtEur(inst.min)}` : `Minimum ${P.fmtEur(inst.min)} · settles T+0 in EURC`}
            </div>
            <div style={{ background: "var(--parch-100)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "13px 15px", marginTop: 18 }}>
              {[["Instrument", inst.isin], ["Coupon", inst.coupon ? inst.coupon.toFixed(2) + "%" : "NAV-linked"], ["Settlement", "T+0 · EURC · Canton"], ["Custody", "Clearstream + Fireblocks"]].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0" }}>
                  <span style={{ fontSize: 12, color: "var(--fg-2)" }}>{k}</span><span className="mono" style={{ fontSize: 12, color: "var(--clavis-navy)" }}>{v}</span>
                </div>
              ))}
            </div>
            <button className="btn btn-primary" disabled={amount < inst.min} style={{ width: "100%", justifyContent: "center", marginTop: 18, padding: 13 }}
              onClick={() => setStage("confirm")}>Review subscription <Icon name="arrow-right" size={15} /></button>
          </div>
        )}

        {stage === "confirm" && (
          <div style={{ padding: 22 }}>
            <p style={{ fontSize: 13.5, color: "var(--fg-1)", lineHeight: 1.6 }}>
              You are subscribing <strong className="mono">{P.fmtEur(amount)}</strong> to <strong>{inst.name}</strong>. A Daml smart contract will
              execute atomic delivery-versus-payment on confirmation.
            </p>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 16, fontSize: 12, color: "var(--fg-2)", lineHeight: 1.5 }}>
              <input type="checkbox" defaultChecked style={{ marginTop: 2 }} /> I confirm my MiFID II professional categorisation and have reviewed the instrument term sheet and KID.
            </label>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button className="btn btn-ghost" style={{ flex: 1, justifyContent: "center" }} onClick={() => setStage("form")}>Back</button>
              <button className="btn btn-gold" style={{ flex: 1.4, justifyContent: "center" }} onClick={() => setStage("done")}><Icon name="key-round" size={15} /> Confirm & settle</button>
            </div>
          </div>
        )}

        {stage === "done" && (
          <div style={{ padding: "34px 22px", textAlign: "center" }}>
            <div style={{ width: 56, height: 56, margin: "0 auto", borderRadius: "50%", background: "var(--verified-bg)", display: "flex", alignItems: "center", justifyContent: "center", color: "#2F6E4F" }}>
              <Icon name="check" size={28} strokeWidth={2.2} />
            </div>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 21, color: "var(--clavis-navy)", marginTop: 18 }}>Settled — T+0</h3>
            <p style={{ fontSize: 13, color: "var(--fg-2)", marginTop: 8, lineHeight: 1.55 }}>
              {P.fmtEur(amount)} subscribed to {inst.name}. A subscription confirmation has been added to your documents.
            </p>
            <div className="mono" style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 12 }}>tx · 0x7f3a…e21b · Canton Network</div>
            <button className="btn btn-primary" style={{ marginTop: 22, justifyContent: "center", padding: "11px 28px" }} onClick={onClose}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

function InstrumentDetail({ isin, onBack }) {
  const P = window.PORTAL;
  const inst = P.holdings.find((h) => h.isin === isin) || P.marketplace.find((m) => m.isin === isin);
  const [showSub, setShowSub] = useDetState(false);
  if (!inst) return null;
  const held = P.holdings.includes(inst);
  const minVal = inst.min || 100000;

  return (
    <div className="screen-wrap">
      <button className="btn btn-ghost" style={{ padding: "8px 14px", fontSize: 12.5 }} onClick={onBack}><Icon name="arrow-left" size={14} /> Back</button>

      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 26, marginTop: 22, alignItems: "start" }}>
        {/* main */}
        <div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Chip kind={P.themeOf[inst.theme]}>{inst.theme}</Chip>
            <span className="chip neutral">{inst.type}</span>
            {held && <Chip kind="verified">Held</Chip>}
          </div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 34, color: "var(--clavis-navy)", lineHeight: 1.1, marginTop: 14 }}>{inst.name}</h1>
          <div className="mono" style={{ fontSize: 13, color: "var(--fg-2)", marginTop: 8 }}>{inst.isin}</div>

          <div className="card" style={{ marginTop: 24, padding: "8px 22px" }}>
            {[["Coupon", inst.coupon ? inst.coupon.toFixed(2) + "% p.a." : "NAV-linked distribution"],
              ["Maturity", inst.maturity], ["Structure", inst.structure],
              ["Settlement", "T+0 atomic DvP · EURC · Canton Network"],
              ["Custody", "Clearstream + Fireblocks (sub-custody)"],
              ["Regulatory basis", "MiFID II professional · AMLD6 KYC verified"]].map(([k, v], i, a) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "14px 0", borderBottom: i < a.length - 1 ? "1px solid var(--border)" : "none" }}>
                <span style={{ fontSize: 13, color: "var(--fg-2)" }}>{k}</span>
                <span className="mono" style={{ fontSize: 13, color: "var(--clavis-navy)", textAlign: "right" }}>{v}</span>
              </div>
            ))}
          </div>

          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 19, color: "var(--clavis-navy)", marginTop: 28 }}>Instrument summary</h2>
          <p style={{ fontSize: 13.5, color: "var(--fg-1)", lineHeight: 1.65, marginTop: 10 }}>
            A {inst.type.toLowerCase()} issued by Van Beirs Finance SA under its {inst.theme.toLowerCase()} programme, tokenised on Canton Network
            and distributed exclusively through Clavoris. Holdings, counterparties and transactions are visible only to authorised parties —
            privacy is preserved at protocol level. Settlement is atomic and final at T+0.
          </p>
        </div>

        {/* subscribe rail */}
        <div className="card cl-watermark" style={{ position: "relative", overflow: "hidden", padding: 22, position: "sticky", top: 90 }}>
          <div style={{ position: "relative" }}>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--fg-3)", fontWeight: 600 }}>Minimum investment</div>
            <div className="mono" style={{ fontSize: 30, color: "var(--clavis-navy)", marginTop: 6, letterSpacing: "-.02em" }}>{P.fmtEur(minVal)}</div>
            {inst.coupon && <div style={{ fontSize: 13, color: "var(--seal-gold)", marginTop: 6, fontWeight: 500 }}>{inst.coupon.toFixed(2)}% coupon · {inst.maturity}</div>}
            <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 20, padding: 13 }} onClick={() => setShowSub(true)}>
              <Icon name="key-round" size={16} /> {held ? "Add to position" : "Subscribe"}
            </button>
            <button className="btn btn-ghost" style={{ width: "100%", justifyContent: "center", marginTop: 10 }}><Icon name="file-text" size={15} /> Term sheet & KID</button>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 16, fontSize: 11, color: "var(--fg-3)", justifyContent: "center" }}>
              <Icon name="shield-check" size={13} /> Available to professional investors only
            </div>
          </div>
        </div>
      </div>

      {showSub && <SubscribeModal inst={{ ...inst, min: minVal }} onClose={() => setShowSub(false)} />}
    </div>
  );
}

window.InstrumentDetail = InstrumentDetail;
