/* App orchestration + footer. */
const { useState: useAppState } = React;

function Footer() {
  return (
    <footer style={{ background: "var(--parch-dark)", borderTop: "1px solid var(--border)", padding: "20px 40px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <img src="../../assets/clavoris-mark.png" alt="" style={{ height: 22 }} />
        <span style={{ fontSize: 11.5, color: "var(--fg-2)" }}>Clavoris · Institutional Capital Platform</span>
      </div>
      <div style={{ fontSize: 11, color: "var(--fg-3)", letterSpacing: ".02em" }}>Antwerp · Luxembourg · Nordic · CSSF · FSMA · MiCA</div>
    </footer>
  );
}

function App() {
  const P = window.PORTAL;
  const [authed, setAuthed] = useAppState(false);
  const [screen, setScreen] = useAppState("portfolio");
  const [activeIsin, setActiveIsin] = useAppState(null);

  if (!authed) return <Login onEnter={() => setAuthed(true)} investor={P.investor} />;

  function nav(id) { setScreen(id); window.scrollTo({ top: 0 }); }
  function openInstrument(isin) {
    if (isin) { setActiveIsin(isin); setScreen("detail"); }
    else setScreen("marketplace");
    window.scrollTo({ top: 0 });
  }

  return (
    <div className="app">
      <Nav screen={screen} onNav={nav} investor={P.investor} />
      {screen === "portfolio" && <Portfolio onOpenInstrument={openInstrument} investor={P.investor} />}
      {screen === "marketplace" && <Marketplace onOpen={openInstrument} />}
      {screen === "detail" && <InstrumentDetail isin={activeIsin} onBack={() => nav("marketplace")} />}
      {screen === "documents" && <Documents />}
      <Footer />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
