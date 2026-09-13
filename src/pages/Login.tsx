import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Layers,
  Store,
  UtensilsCrossed,
  Lock,
  User as UserIcon,
  Smartphone,
  CalendarRange,
  ShieldCheck,
  Building2,
  Pencil,
} from "lucide-react";
import { useAuth, Role } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { AuthService } from "@/services/auth.service";
import { Franchise } from "@/services/auth.types";

const FINANCIAL_YEARS = ["2026-27", "2025-26", "2024-25", "2023-24"];

const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  // ----- Company Code -----
  const [companyCode, setCompanyCode] = useState("");
  const [companyVerified, setCompanyVerified] = useState(false);
  const [franchise, setFranchise] = useState<Franchise | null>(null);
  const [franchiseType, setFranchiseType] = useState<1 | 2>(1);
  const [renewalExpired, setRenewalExpired] = useState(false);
  const [renewalMessage, setRenewalMessage] = useState("");

  // ----- Role & Financial Year -----
  const [role, setRole] = useState<Role>("shop");
  const [financialYear, setFinancialYear] = useState(FINANCIAL_YEARS[0]);

  // ----- Password mode -----
  const [MobileNumber, setMobileNumber] = useState("");
  const [password, setPassword] = useState("");

  // ----- OTP mode -----
  const [mobile, setMobile] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [seconds, setSeconds] = useState(0);
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);

  const [mode, setMode] = useState<"password" | "otp">("password");

  // ----- Submit Company Code (Case 1) -----
  const submitCompanyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyCode.trim()) return toast.error("Enter your company code");

    try {
      const res = await AuthService.verifyCompany(companyCode.trim());
      if (res.status === "success") {
        const company = res.company;
        setFranchise(company);
        setFranchiseType(company.franchise_type);
        setRenewalExpired(res.renewal_expired);
        setRenewalMessage(res.renewal_message);

        // Auto‑set role based on franchise_type
        const autoRole: Role = company.franchise_type === 1 ? "shop" : "restaurant";
        setRole(autoRole);

        setCompanyVerified(true);
        localStorage.setItem("company_code", company.franchise_code);
        localStorage.setItem("company_data", JSON.stringify(company));

        toast.success(res.message, {
          description: `Welcome to ${company.franchise_name}`,
        });

        // Show renewal alert if expired
        if (res.renewal_expired) {
          toast.warning("Subscription Expired", {
            description: res.renewal_message,
            duration: 6000,
          });
        }
      } else {
        toast.error(res.message || "Invalid company code");
      }
    } catch (err: any) {
      console.error("Company verification error:", err);
      toast.error(err.response?.data?.message || "Error verifying company code");
    }
  };

  const changeCompanyCode = () => {
    setCompanyVerified(false);
    setFranchise(null);
  };

  // ----- Helper: Finalize login (store auth, navigate) -----
  const finalizeLogin = (
    userData: any,
    token: string,
    company: Franchise,
    franchiseType: 1 | 2,
    renewalExpired: boolean,
    renewalMessage: string
  ) => {
    // Store token and user
    localStorage.setItem("token", token);
    localStorage.setItem("user_data", JSON.stringify(userData));
    localStorage.setItem("company_data", JSON.stringify(company));

    // Update AuthContext
    const role: Role = franchiseType === 1 ? "shop" : "restaurant";
    login({
      MobileNumber: userData.name,
      role,
      shopName: role === "shop" ? company.franchise_name : "Restaurant",
      mobile: userData.employee_mobile,
      email: userData.email,
      financialYear,
    });

    toast.success("Login successful", {
      description: `Welcome ${userData.name}`,
    });

    // Show renewal warning if expired
    if (renewalExpired) {
      toast.warning("Subscription Expired", {
        description: renewalMessage,
        duration: 6000,
      });
    }

    navigate(role === "restaurant" ? "/restaurant-tables" : "/");
  };

  // ----- Password Login (Case 2) -----
  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!MobileNumber.trim() || !password.trim()) {
      return toast.error("Enter mobile number and password");
    }

    try {
      const res = await AuthService.loginWithPassword(
        companyCode.trim(),
        MobileNumber.trim(),
        password.trim()
      );

      if (res.status === "success" && res.token && res.user && res.company) {
        finalizeLogin(
          res.user,
          res.token,
          res.company,
          res.franchise_type,
          res.renewal_expired,
          res.renewal_message
        );
      } else {
        toast.error(res.message || "Invalid credentials");
      }
    } catch (err: any) {
      console.error("Password login error:", err);
      toast.error(err.response?.data?.message || "Login failed");
    }
  };

  // ----- Send OTP (Case 3) -----
  const sendOtp = async () => {
    if (mobile.trim().length !== 10) {
      return toast.error("Enter a valid 10-digit mobile number");
    }

    try {
      const res = await AuthService.sendOtp(companyCode.trim(), mobile.trim());
      if (res.status === "success") {
        setOtpSent(true);
        setOtp(["", "", "", "", "", ""]);
        setSeconds(30);
        toast.success("OTP sent", {
          description: `A 6-digit code was sent to ${mobile}`,
        });
        // For testing only – show OTP in console (or toast)
        if (res.otp) {
          console.log("OTP (for testing):", res.otp);
          toast.info(`Demo OTP: ${res.otp}`, { duration: 5000 });
        }
        setTimeout(() => otpRefs.current[0]?.focus(), 80);
      } else {
        toast.error(res.message || "Failed to send OTP");
      }
    } catch (err: any) {
      console.error("Send OTP error:", err);
      toast.error(err.response?.data?.message || "Error sending OTP");
    }
  };

  // ----- Verify OTP (Case 4) -----
  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.some((d) => !d)) {
      return toast.error("Enter the complete 6-digit OTP");
    }
    const otpCode = otp.join("");

    try {
      const res = await AuthService.verifyOtp(
        companyCode.trim(),
        mobile.trim(),
        otpCode
      );

      if (res.status === "success" && res.token && res.user && res.company) {
        finalizeLogin(
          res.user,
          res.token,
          res.company,
          res.franchise_type,
          res.renewal_expired,
          res.renewal_message
        );
      } else {
        toast.error(res.message || "Invalid OTP");
      }
    } catch (err: any) {
      console.error("OTP verification error:", err);
      toast.error(err.response?.data?.message || "OTP verification failed");
    }
  };

  // OTP input handlers
  const setOtpDigit = (idx: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    setOtp((prev) => {
      const next = [...prev];
      next[idx] = digit;
      return next;
    });
    if (digit && idx < 5) otpRefs.current[idx + 1]?.focus();
  };

  const onOtpKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otp[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus();
    }
  };

  // OTP timer
  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  // ----- Render -----
  return (
    <div className="min-h-screen flex items-stretch bg-background">
      {/* Brand panel (desktop) */}
      <div className="hidden lg:flex w-[46%] flex-col justify-between p-10 bg-gradient-cool text-primary-foreground">
        <div className="flex items-center gap-2.5">
          <img src="images/logo/SunShine-tra.png" style={{ width: '30%' }} alt="SunShine Logo" />
        </div>
        <div className="space-y-4 max-w-md">
          <h2 className="font-display text-3xl font-extrabold leading-tight">
            One platform for your shop and your restaurant.
          </h2>
          <p className="text-sm opacity-80 leading-relaxed">
            Billing, GST invoicing, table service, inventory, staff attendance
            and financial reporting — in a single corporate-grade workspace.
          </p>
          <ul className="space-y-2 text-sm opacity-90">
            {[
              "Fast POS & table billing",
              "GST-ready purchase entry",
              "Outstanding & collection tracking",
            ].map((f) => (
              <li key={f} className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" /> {f}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs opacity-70">
          © 2026 SunShine Software Pvt. Ltd. • v1.4.0
        </p>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden text-center mb-6">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground mb-3">
              <Layers className="h-6 w-6" />
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight">
              SunShine
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Billing & business suite
            </p>
          </div>

          <Card className="border-border shadow-card">
            <CardContent className="p-6 space-y-5">
              <div>
                <h2 className="font-display text-xl font-bold">Sign in</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {companyVerified
                    ? "Select your financial year and sign in"
                    : "Enter your company code to continue"}
                </p>
              </div>

              {!companyVerified ? (
                // --- Step 1: Company Code gate ---
                <form onSubmit={submitCompanyCode} className="space-y-4">
                  <div>
                    <Label className="text-xs font-semibold">Company Code</Label>
                    <div className="relative mt-1">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={companyCode}
                        onChange={(e) => setCompanyCode(e.target.value.toUpperCase())}
                        placeholder="e.g. BIZ2026"
                        className="pl-9 font-display tracking-wide"
                        autoFocus
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full font-display">
                    Continue
                  </Button>
                </form>
              ) : (
                // --- Step 2: Sign-in options ---
                <>
                  <div className="flex items-center justify-between rounded-xl border border-border bg-muted/50 px-3 py-2">
                    <div className="flex items-center gap-2 text-xs">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-display font-semibold tracking-wide">
                        {companyCode}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={changeCompanyCode}
                      className="flex items-center gap-1 text-xs text-primary font-medium"
                    >
                      <Pencil className="h-3 w-3" /> Change
                    </button>
                  </div>

                  {/* Role selection – auto‑set from franchise_type, disabled */}
                  <div className="grid grid-cols-2 gap-2 opacity-70 cursor-not-allowed d-none">
                    <div
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 ${
                        role === "shop"
                          ? "border-primary bg-primary/5"
                          : "border-border"
                      }`}
                    >
                      <Store className={`h-5 w-5 ${role === "shop" ? "text-primary" : "text-muted-foreground"}`} />
                      <span className={`text-xs font-medium ${role === "shop" ? "text-primary" : ""}`}>
                        Shop Owner
                      </span>
                    </div>
                    <div
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 ${
                        role === "restaurant"
                          ? "border-accent bg-accent/5"
                          : "border-border"
                      }`}
                    >
                      <UtensilsCrossed className={`h-5 w-5 ${role === "restaurant" ? "text-accent" : "text-muted-foreground"}`} />
                      <span className={`text-xs font-medium ${role === "restaurant" ? "text-accent" : ""}`}>
                        Restaurant Owner
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground text-center -mt-1 d-none">
                    Role is auto‑selected from your company settings
                  </p>

                  {/* Financial Year */}
                  <div>
                    <Label className="text-xs font-semibold">Financial Year</Label>
                    <Select value={financialYear} onValueChange={setFinancialYear}>
                      <SelectTrigger className="mt-1">
                        <CalendarRange className="h-4 w-4 mr-2 text-muted-foreground" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FINANCIAL_YEARS.map((fy) => (
                          <SelectItem key={fy} value={fy}>
                            FY {fy}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Mode tabs */}
                  <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-muted d-none">
                    {(["password", "otp"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMode(m)}
                        className={`py-2 rounded-lg text-xs font-semibold font-display transition-colors ${
                          mode === m
                            ? "bg-card text-foreground shadow-sm"
                            : "text-muted-foreground"
                        }`}
                      >
                        {m === "password" ? "Password" : "OTP"}
                      </button>
                    ))}
                  </div>

                  {mode === "password" ? (
                    <form onSubmit={submitPassword} className="space-y-4">
                      <div>
                        <Label className="text-xs font-semibold">Mobile Number</Label>
                        <div className="relative mt-1">
                          <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            value={MobileNumber}
                            onChange={(e) => setMobileNumber(e.target.value)}
                            placeholder="Enter mobile number"
                            className="pl-9"
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs font-semibold">Password</Label>
                        <div className="relative mt-1">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            className="pl-9"
                          />
                        </div>
                      </div>
                      <Button type="submit" className="w-full font-display">
                        Login as {role === "shop" ? "Shop Owner" : "Restaurant Owner"}
                      </Button>
                      <button
                        type="button"
                        onClick={() => setMode("otp")}
                        className="w-full text-xs text-primary font-medium d-none"
                      >
                        Login with OTP instead
                      </button>
                    </form>
                  ) : (
                    <form
                      onSubmit={
                        otpSent
                          ? verifyOtp
                          : (e) => {
                              e.preventDefault();
                              sendOtp();
                            }
                      }
                      className="space-y-4"
                    >
                      <div>
                        <Label className="text-xs font-semibold">Mobile Number</Label>
                        <div className="relative mt-1">
                          <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            inputMode="numeric"
                            value={mobile}
                            onChange={(e) =>
                              setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))
                            }
                            placeholder="10-digit mobile"
                            className="pl-9 font-display tracking-wide"
                          />
                        </div>
                      </div>

                      {otpSent && (
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold">Enter 6-digit OTP</Label>
                          <div className="flex gap-2">
                            {otp.map((d, i) => (
                              <input
                                key={i}
                                ref={(el) => (otpRefs.current[i] = el)}
                                value={d}
                                onChange={(e) => setOtpDigit(i, e.target.value)}
                                onKeyDown={(e) => onOtpKeyDown(i, e)}
                                inputMode="numeric"
                                maxLength={1}
                                aria-label={`OTP digit ${i + 1}`}
                                className="h-12 w-full rounded-xl border-2 border-input bg-background text-center font-display text-lg font-bold outline-none focus:border-primary focus:ring-2 focus:ring-ring/30"
                              />
                            ))}
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">
                              Sent to +91 {mobile}
                            </span>
                            {seconds > 0 ? (
                              <span className="text-muted-foreground">
                                Resend in {seconds}s
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={sendOtp}
                                className="text-primary font-medium"
                              >
                                Resend OTP
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      <Button type="submit" className="w-full font-display">
                        {otpSent ? "Verify & Login" : "Send OTP"}
                      </Button>
                      <button
                        type="button"
                        onClick={() => setMode("password")}
                        className="w-full text-xs text-primary font-medium"
                      >
                        Login with Password instead
                      </button>
                    </form>
                  )}
                </>
              )}

              <p className="text-[11px] text-center text-muted-foreground border-t border-border pt-3">
                Demo login — use any valid mobile/password or OTP
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Login;