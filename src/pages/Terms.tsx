const sections = [
  {
    title: "Acceptance of terms",
    body: "By creating an account and using BizBright you agree to these terms. If you do not agree, please discontinue use of the application.",
  },
  {
    title: "Your account",
    body: "You are responsible for keeping your login credentials confidential and for all activity performed under your account, including activity by your staff users.",
  },
  {
    title: "Correct use",
    body: "Invoices, GST figures and financial reports produced by the app are based entirely on the data you enter. You remain responsible for the accuracy of your statutory filings.",
  },
  {
    title: "Subscription & billing",
    body: "Paid plans renew for the selected term. Charges are non-refundable for a period already started, and you may cancel renewal at any time before the next cycle.",
  },
  {
    title: "Limitation of liability",
    body: "BizBright is provided on an as-is basis. We are not liable for indirect or consequential losses arising from use of the application.",
  },
];

const Terms = () => (
  <div className="max-w-3xl space-y-4">
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <h2 className="font-display text-lg font-bold">Terms &amp; Conditions</h2>
      <p className="text-xs text-muted-foreground mt-1">Last updated: 1 April 2026 • Version 1.4.0</p>
    </div>
    {sections.map((s) => (
      <section key={s.title} className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <h3 className="font-display text-sm font-semibold text-primary">{s.title}</h3>
        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{s.body}</p>
      </section>
    ))}
  </div>
);

export default Terms;
