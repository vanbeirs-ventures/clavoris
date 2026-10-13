/* Login / KYC access gate. */
const { useState: useLoginState } = React;

function Login({ onEnter, investor }) {
  const [step, setStep] = useLoginState("credentials"); // credentials -> verifying -> done
  const [email, setEmail] = useLoginState("s.vanbeirs@clavoris.com");

  function submit() {
    setStep("verifying");
    setTimeout(() => onEnter(), 1400);
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "1.1fr 1fr" }}>
      {/* Left — navy authority panel */}
      <div className="cl-watermark" style={{ position: "relative", background: "var(--clavis-navy)", padding: "56px 60px",
        display: "flex", flexDirection: "column", justifyContent: "space-between", overflow: "hidden" }}>
        <div style={{ position: "relative" }}><Wordmark size={26} light /></div>
        <div style={{ position: "relative" }}>
          <Eyebrow style={{ color: "var(--gold-light)" }}>Institutional Capital Platform</Eyebrow>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 46, color: "var(--parchment)", lineHeight: 1.08, marginTop: 18, letterSpacing: "-.01em" }}>
            Private capital,<br />precisely secured.
          </h1>
          <p style={{ fontSize: 14.5, color: "var(--fg-on-navy-2)", lineHeight: 1.65, marginTop: 20, maxWidth: 420 }}>
            Tokenised private bonds and SICAV-RAIF share classes from Van Beirs Finance SA. T+0 settlement on Canton Network,
            for qualified professional investors.
          </p>
        </div>
        <div style={{ position: "relative", display: "flex", gap: 22, color: "var(--fg-on-navy-2)", fontSize: 11.5, letterSpacing: ".02em" }}>
          {["MiFID II", "AMLD6 KYC", "Canton Network", "EURC · MiCA"].map((t) => (
            <span key={t} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="shield-check" size={14} style={{ color: "var(--gold-light)" }} />{t}
            </span>
          ))}
        </div>
      </div>

      {/* Right — access form */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 48, background: "var(--bg-page)" }}>
        <div style={{ width: "100%", maxWidth: 360 }}>
          {step !== "verifying" ? (
            <React.Fragment>
              <Eyebrow>Authorised access</Eyebrow>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 27, color: "var(--clavis-navy)", marginTop: 8 }}>Sign in to your portal</h2>
              <p style={{ fontSize: 13, color: "var(--fg-2)", marginTop: 8, lineHeight: 1.5 }}>Access is exclusive to verified professional investors.</p>

              <div style={{ marginTop: 28 }}>
                <label style={labelSt}>Institutional email</label>
                <input value={email} onChange={(e) => setEmail(e.target.value)} style={inputSt} />
              </div>
              <div style={{ marginTop: 16 }}>
                <label style={labelSt}>Passphrase</label>
                <input type="password" defaultValue="••••••••••••" style={{ ...inputSt, fontFamily: "var(--font-data)" }} />
              </div>

              <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 24, padding: "13px" }} onClick={submit}>
                <Icon name="key-round" size={16} /> Unlock portal
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 18, fontSize: 11.5, color: "var(--fg-3)", justifyContent: "center" }}>
                <Icon name="lock" size={13} /> Secured by Sumsub digital identity · eIDAS 2.0
              </div>
            </React.Fragment>
          ) : (
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 56, height: 56, margin: "0 auto", borderRadius: "50%", border: "2px solid var(--seal-gold)",
                borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 23, color: "var(--clavis-navy)", marginTop: 24 }}>Verifying credentials</h2>
              <p className="mono" style={{ fontSize: 12, color: "var(--fg-2)", marginTop: 10 }}>Canton whitelist · AMLD6 · KYC status</p>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

const labelSt = { display: "block", fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--fg-2)", marginBottom: 7 };
const inputSt = { width: "100%", fontSize: 14, color: "var(--fg-1)", background: "var(--bg-raised)", border: "1px solid var(--border-strong)",
  borderRadius: "var(--r-sm)", padding: "11px 13px", outline: "none" };

window.Login = Login;
