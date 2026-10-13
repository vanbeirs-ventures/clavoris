/* Clavoris Investor Portal — mock data. Attached to window. */
window.PORTAL = (function () {
  const holdings = [
    { name: "Van Beirs Real Estate Bond II", isin: "LU0123456789", type: "Standalone Bond", theme: "Real Estate",
      coupon: 6.50, maturity: "2029-06-30", invested: 750000, value: 781250, structure: "Art. 5 · EU Prospectus Reg.", status: "settled" },
    { name: "VBF Energy Infrastructure Bond", isin: "LU0987654321", type: "Partnership Bond", theme: "Energy",
      coupon: 7.25, maturity: "2030-03-31", invested: 500000, value: 512500, structure: "Evonity Nordic compartment", status: "settled" },
    { name: "Van Beirs Diversified SICAV — A", isin: "LU0456781234", type: "SICAV-RAIF Share", theme: "Multi-asset",
      coupon: null, maturity: "Open-ended", invested: 900000, value: 982000, structure: "AIFMD / RAIF Law 2016", status: "settled" },
    { name: "Minerva Luxury Motors Bond I", isin: "LU0222333444", type: "Standalone Bond", theme: "Luxury",
      coupon: 5.80, maturity: "2028-12-15", invested: 250000, value: 254100, structure: "Art. 5 · VBF SA compartment", status: "pending" },
  ];

  const marketplace = [
    { name: "Charles Fontana & Cie Bond", isin: "LU0771122334", type: "Partnership Bond", theme: "Luxury",
      coupon: 6.10, maturity: "2030-06-30", min: 100000, size: "€2.0M", structure: "Art. 5 · VBF SA compartment", status: "open" },
    { name: "Van Beirs Capital Holdings SICAV — B", isin: "LU0559988776", type: "SICAV-RAIF Share", theme: "Multi-asset",
      coupon: null, maturity: "Open-ended", min: 250000, size: "€8.0M", structure: "AIFMD / RAIF Law 2016", status: "open" },
    { name: "Evonity EV Infrastructure Bond II", isin: "LU0883344556", type: "Partnership Bond", theme: "Energy",
      coupon: 7.40, maturity: "2031-01-31", min: 100000, size: "€3.0M", structure: "Nordic compartment", status: "open" },
    { name: "Belgian Real Estate Development Bond", isin: "LU0667788990", type: "Standalone Bond", theme: "Real Estate",
      coupon: 6.75, maturity: "2029-09-30", min: 100000, size: "€1.5M", structure: "Art. 5 · EU Prospectus Reg.", status: "open" },
    { name: "NOUARD Brand Growth Bond", isin: "LU0334455667", type: "Partnership Bond", theme: "Luxury",
      coupon: 5.95, maturity: "2030-12-31", min: 150000, size: "€2.5M", structure: "Art. 5 · VBF SA compartment", status: "closing" },
    { name: "Van Beirs Diversified SICAV — C", isin: "LU0445566778", type: "SICAV-RAIF Share", theme: "Multi-asset",
      coupon: null, maturity: "Open-ended", min: 250000, size: "€10.0M", structure: "AIFMD / RAIF Law 2016", status: "open" },
  ];

  const documents = [
    { name: "Subscription Confirmation — Real Estate Bond II", kind: "Confirmation", date: "2026-04-02", size: "148 KB", instrument: "LU0123456789" },
    { name: "MiFID II Investor Categorisation", kind: "Compliance", date: "2026-03-28", size: "212 KB", instrument: "—" },
    { name: "AMLD6 KYC Verification Record", kind: "Compliance", date: "2026-03-28", size: "96 KB", instrument: "—" },
    { name: "Q1 2026 Portfolio Statement", kind: "Statement", date: "2026-04-01", size: "324 KB", instrument: "—" },
    { name: "VBF Energy Bond — Term Sheet", kind: "Term Sheet", date: "2026-02-14", size: "188 KB", instrument: "LU0987654321" },
    { name: "AIFMD Investor Report — Diversified SICAV", kind: "Report", date: "2026-04-01", size: "402 KB", instrument: "LU0456781234" },
  ];

  const investor = { name: "Stephan Van Beirs", initial: "S", entity: "Van Beirs Group · Family Office",
    category: "Professional · MiFID II", member: "Member since 2026" };

  const themeOf = { "Real Estate": "info", "Energy": "verified", "Luxury": "pending", "Multi-asset": "neutral" };

  const fmtEur = (n) => "€" + n.toLocaleString("en-GB");
  const totalValue = holdings.reduce((s, h) => s + h.value, 0);
  const totalInvested = holdings.reduce((s, h) => s + h.invested, 0);

  return { holdings, marketplace, documents, investor, themeOf, fmtEur, totalValue, totalInvested };
})();
