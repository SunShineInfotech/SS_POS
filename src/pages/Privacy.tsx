const sections = [
  {
    title: "Information we collect",
    body: "We collect the business data you enter into BizBright — invoices, customers, vendors, products, staff records and payment entries — along with basic account details such as your username, mobile number and email address.",
  },
  {
    title: "How we use your data",
    body: "Your data is used solely to operate the billing, inventory and reporting features of the application. We never sell your business data or share it with advertisers.",
  },
  {
    title: "Data storage",
    body: "Records are stored securely and are only accessible to users signed in to your business account. You may export your data as CSV at any time from any list screen.",
  },
  {
    title: "Your choices",
    body: "You can request deletion of your account and associated data at any time by contacting support. Deleted records are retained in a recoverable state for 30 days before permanent removal.",
  },
  {
    title: "Contact",
    body: "For any privacy question, write to privacy@bizbright.app and our team will respond within 3 working days.",
  },
];

const Privacy = () => (
  <div className="max-w-3xl space-y-4">
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <h2 className="font-display text-lg font-bold">Privacy Policy</h2>
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

export default Privacy;
