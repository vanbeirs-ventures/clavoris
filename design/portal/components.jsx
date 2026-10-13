/* Shared primitives + top nav. Exports to window. */
const { useEffect, useRef } = React;

// Lucide icon — renders an <i data-lucide> then hydrates it to SVG.
function Icon({ name, size = 16, strokeWidth = 1.75, style, className }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && window.lucide) {
      ref.current.innerHTML = "";
      const i = document.createElement("i");
      i.setAttribute("data-lucide", name);
      ref.current.appendChild(i);
      window.lucide.createIcons({
        attrs: { width: size, height: size, "stroke-width": strokeWidth },
        nameAttr: "data-lucide",
      });
    }
  });
  return <span ref={ref} className={className} style={{ display: "inline-flex", lineHeight: 0, color: "currentColor", ...style }} />;
}

function Eyebrow({ children, style }) {
  return <div className="eyebrow" style={style}>{children}</div>;
}

function Wordmark({ size = 23, light = false }) {
  return (
    <span className="nav-brand" style={{ gap: 9 }}>
      <img src={`../../assets/clavoris-mark${light ? "-reversed" : ""}.png`} alt="" style={{ height: size * 1.3 }} />
      <span className="nav-wm" style={{ fontSize: size, color: light ? "var(--parchment)" : "var(--clavis-navy)" }}>
        Clavori<span className="g">s</span>
      </span>
    </span>
  );
}

function Chip({ kind = "neutral", children }) {
  const dotColor = { verified: "#2F6E4F", pending: "#B8860B", alert: "#9B2C2C", info: "#2E5279" }[kind];
  return (
    <span className={`chip ${kind}`}>
      {dotColor && <span className="dot" style={{ background: dotColor }} />}
      {children}
    </span>
  );
}

function Nav({ screen, onNav, investor }) {
  const tabs = [
    { id: "portfolio", label: "Portfolio" },
    { id: "marketplace", label: "Instruments" },
    { id: "documents", label: "Documents" },
  ];
  return (
    <nav className="nav">
      <button onClick={() => onNav("portfolio")} style={{ background: "none" }}><Wordmark /></button>
      <div className="nav-links">
        {tabs.map((t) => (
          <button key={t.id} className={`nav-lk ${screen === t.id || (screen === "detail" && t.id === "marketplace") ? "active" : ""}`}
            onClick={() => onNav(t.id)}>{t.label}</button>
        ))}
      </div>
      <div className="nav-right">
        <Chip kind="verified">KYC Verified</Chip>
        <div className="nav-av" title={investor.name}>{investor.initial}</div>
      </div>
    </nav>
  );
}

// Small labelled stat used in headers
function StatPair({ k, v, sub, accent }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--fg-3)", fontWeight: 600 }}>{k}</div>
      <div className="mono" style={{ fontSize: 24, color: accent ? "var(--seal-gold)" : "var(--clavis-navy)", marginTop: 6, letterSpacing: "-.02em" }}>{v}</div>
      {sub && <div style={{ fontSize: 11.5, color: "var(--fg-2)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

Object.assign(window, { Icon, Eyebrow, Wordmark, Chip, Nav, StatPair });
