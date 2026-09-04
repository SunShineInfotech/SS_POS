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
import axios from "axios";

const FINANCIAL_YEARS = ["2026-27", "2025-26", "2024-25", "2023-24"];

const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [role, setRole] = useState<Role>("shop");
  const [mode, setMode] = useState<"password" | "otp">("password");
  const [financialYear, setFinancialYear] = useState(FINANCIAL_YEARS[0]);

  // --- Company Code gate ---
  const [companyCode, setCompanyCode] = useState("");
  const [companyVerified, setCompanyVerified] = useState(false);

  const [MobileNumber, setMobileNumber] = useState("");
  const [password, setPassword] = useState("");

  const [mobile, setMobile] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [seconds, setSeconds] = useState(0);
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);

  const API_URL =
    import.meta.env.VITE_API_URL || "https://sunshineproduct.in/POS/v1_api/";

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  const submitCompanyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyCode.trim()) return toast.error("Enter your company code");

    try {
      const res = await axios.post(`${API_URL}login.php`, {
        type: 1,
        company_code: companyCode.trim(),
      });

      if (res.data.status === "success") {
        const company = res.data.company;
        setCompanyCode(company.franchise_code);
        setCompanyVerified(true);
        localStorage.setItem("company_code", company.franchise_code);
        localStorage.setItem("company_data", JSON.stringify(company));

        toast.success(res.data.message, {
          description: `Welcome to ${company.company_name}`,
        });
      } else {
        toast.error(res.data.message || "Invalid company code");
      }
      console.log("Company code validation response:", res.data);
    } catch (err) {
      console.error("Error validating company code:", err);
      toast.error("Error validating company code. Please try again.");
      return;
    } finally {
    }
  };

  const changeCompanyCode = () => {
    setCompanyVerified(false);
  };

  const finish = (name: string) => {
    login({
      MobileNumber: name,
      role,
      shopName: role === "shop" ? "My Shop" : "My Restaurant",
      mobile: mobile || "9876543210",
      email: "",
      financialYear,
      // companyCode, // include this in your AuthContext/login payload if needed downstream
    });
    toast.success(`Welcome ${name}`, {
      description: `Financial year ${financialYear}`,
    });
    navigate(role === "restaurant" ? "/restaurant-tables" : "/");
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!MobileNumber.trim() || !password.trim())
      return toast.error("Enter MobileNumber and password");
    // finish(MobileNumber.trim());
    try {
      const res: any = await axios.post(`${API_URL}login.php`, {
        type: 1,
        company_code: companyCode.trim(),
        mobile: MobileNumber.trim(),
        password: password.trim(),
      });

      if (res.data.status === "success") {
        const user = res.data.user;
        const company = res.data.company;
        const existingCompanyData = JSON.parse(
          localStorage.getItem("company_data") || "{}",
        );

        localStorage.setItem(
          "company_data",
          JSON.stringify({ ...existingCompanyData, ...company }),
        );
        localStorage.setItem("token", res.data.token);
        localStorage.setItem("user_data", JSON.stringify(user));

        login({
          MobileNumber: user.name,
          role,
          shopName: role === "shop" ? "My Shop" : "My Restaurant",
          mobile: user.employee_mobile,
          email: user.email,
          financialYear,
        });

        toast.success(res.data.message, {
          description: `Welcome ${user.name}`,
        });
        navigate(role === "restaurant" ? "/restaurant-tables" : "/");
      } else {
        toast.error(res.data.message || "Invalid MobileNumber or password");
      }
      console.log("Password login response:", res.data);
    } catch (err) {
      console.error("Error during password login:", err);
      toast.error("Error during login. Please try again.");
    } finally {
    }
  };

  const sendOtp = () => {
    if (mobile.trim().length !== 10)
      return toast.error("Enter a valid 10-digit mobile number");
    setOtpSent(true);
    setOtp(["", "", "", "", "", ""]);
    setSeconds(30);
    toast.success("OTP sent", {
      description: `A 6-digit code was sent to ${mobile}`,
    });
    setTimeout(() => otpRefs.current[0]?.focus(), 80);
  };

  const setOtpDigit = (idx: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    setOtp((prev) => {
      const next = [...prev];
      next[idx] = digit;
      return next;
    });
    if (digit && idx < 5) otpRefs.current[idx + 1]?.focus();
  };

  const onOtpKeyDown = (
    idx: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Backspace" && !otp[idx] && idx > 0)
      otpRefs.current[idx - 1]?.focus();
  };

  const verifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.some((d) => !d))
      return toast.error("Enter the complete 6-digit OTP");
    finish(`+91 ${mobile}`);
  };

  return (
    <div className="min-h-screen flex items-stretch bg-background">
      {/* Brand panel (desktop) */}
      <div className="hidden lg:flex w-[46%] flex-col justify-between p-10 bg-gradient-cool text-primary-foreground">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-foreground/15">
            <Layers className="h-5 w-5" />
          </span>
          <span className="font-display text-lg font-bold tracking-tight">
            SunShine
          </span>
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
                    ? "Select your business type and financial year"
                    : "Enter your company code to continue"}
                </p>
              </div>

              {!companyVerified ? (
                // --- Step 1: Company Code gate ---
                <form onSubmit={submitCompanyCode} className="space-y-4">
                  <div>
                    <Label className="text-xs font-semibold">
                      Company Code
                    </Label>
                    <div className="relative mt-1">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={companyCode}
                        onChange={(e) =>
                          setCompanyCode(e.target.value.toUpperCase())
                        }
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
                // --- Step 2: Existing sign-in options ---
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

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRole("shop")}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                        role === "shop"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      <Store
                        className={`h-5 w-5 ${role === "shop" ? "text-primary" : "text-muted-foreground"}`}
                      />
                      <span
                        className={`text-xs font-medium ${role === "shop" ? "text-primary" : ""}`}
                      >
                        Shop Owner
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRole("restaurant")}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                        role === "restaurant"
                          ? "border-accent bg-accent/5"
                          : "border-border hover:border-accent/40"
                      }`}
                    >
                      <UtensilsCrossed
                        className={`h-5 w-5 ${role === "restaurant" ? "text-accent" : "text-muted-foreground"}`}
                      />
                      <span
                        className={`text-xs font-medium ${role === "restaurant" ? "text-accent" : ""}`}
                      >
                        Restaurant Owner
                      </span>
                    </button>
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">
                      Financial Year
                    </Label>
                    <Select
                      value={financialYear}
                      onValueChange={setFinancialYear}
                    >
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
                  <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-muted">
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
                        <Label className="text-xs font-semibold">
                          Mobile Number
                        </Label>
                        <div className="relative mt-1">
                          <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            value={MobileNumber}
                            onChange={(e) => setMobileNumber(e.target.value)}
                            placeholder="admin"
                            className="pl-9"
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs font-semibold">
                          Password
                        </Label>
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
                        Login as{" "}
                        {role === "shop" ? "Shop Owner" : "Restaurant Owner"}
                      </Button>
                      <button
                        type="button"
                        onClick={() => setMode("otp")}
                        className="w-full text-xs text-primary font-medium"
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
                        <Label className="text-xs font-semibold">
                          Mobile Number
                        </Label>
                        <div className="relative mt-1">
                          <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            inputMode="numeric"
                            value={mobile}
                            onChange={(e) =>
                              setMobile(
                                e.target.value.replace(/\D/g, "").slice(0, 10),
                              )
                            }
                            placeholder="10-digit mobile"
                            className="pl-9 font-display tracking-wide"
                          />
                        </div>
                      </div>

                      {otpSent && (
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold">
                            Enter 6-digit OTP
                          </Label>
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
                Demo login — any MobileNumber, password or OTP works
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Login;
