import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { Alert, Button, Icon, Input, type IconName } from "../../components/ui";

const highlights: { icon: IconName; text: string }[] = [
  { icon: "user-check", text: "Pendaftaran pasien poli umum dan poli gigi" },
  { icon: "file-text", text: "Rekam medis SOAP, ICD-10, dan odontogram" },
  { icon: "package", text: "Resep apotek dan pembayaran pasien umum" },
];

// Split card: artwork panel (public/img/auth-bg.jpg) on the left, sign-in form on the right.
export function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Superadmin without a company is sent to /app too; the company picker is shown there.
  if (isAuthenticated) return <Navigate to="/app" replace />;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setLoading(true);
    setError("");
    try {
      await login(String(f.get("email")), String(f.get("password")));
      navigate("/app", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login gagal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-page px-4 py-10">
      <div className="grid w-full max-w-[960px] overflow-hidden rounded-xl border border-line bg-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.18)] md:grid-cols-2">
        {/* Artwork panel */}
        <aside className="relative hidden min-h-[560px] flex-col justify-between bg-[#eff4f8] bg-[url(/img/auth-bg.jpg)] bg-[length:110%] bg-[position:50%_-60px] bg-no-repeat p-10 md:flex">
          <div className="flex items-center gap-2.5">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-white">
              <Icon name="plus" size={22} />
            </span>
            <span className="text-[22px] font-medium text-dark">
              Tab<span className="text-primary">Medik</span>
            </span>
          </div>

          <div className="rounded-lg border border-white/70 bg-white/80 p-5 backdrop-blur-sm">
            <h3 className="mb-1 text-lg font-medium text-heading">
              Satu alur kerja untuk klinik Anda
            </h3>
            <p className="mb-4 text-sm text-body">
              Dari pasien datang sampai pembayaran selesai.
            </p>
            <ul className="m-0 list-none space-y-2.5 p-0">
              {highlights.map((h) => (
                <li key={h.text} className="flex items-center gap-3 text-sm text-heading">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                    <Icon name={h.icon} size={15} />
                  </span>
                  {h.text}
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* Form panel */}
        <main className="flex flex-col justify-center px-6 py-10 sm:px-12">
          <div className="mb-8 flex items-center gap-2.5 md:hidden">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-white">
              <Icon name="plus" size={22} />
            </span>
            <span className="text-[22px] font-medium text-dark">
              Tab<span className="text-primary">Medik</span>
            </span>
          </div>

          <h1 className="mb-1 text-[26px] font-semibold text-heading">Masuk ke akun Anda</h1>
          <p className="mb-8 text-body">Gunakan email dan password yang diberikan admin klinik.</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <Input
              name="email"
              label="Email"
              type="email"
              required
              autoFocus
              autoComplete="username"
              placeholder="nama@klinik.id"
              className="h-11"
            />
            <div className="relative">
              <Input
                name="password"
                label="Password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                placeholder="Masukkan password"
                className="h-11 pr-12"
              />
              {/* Input is h-11 (44px); the 36px button sits 4px inside its right edge. */}
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                aria-pressed={showPassword}
                className="absolute right-1 bottom-1 flex size-9 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-light hover:text-heading"
              >
                <Icon name={showPassword ? "eye-off" : "eye"} size={18} />
              </button>
            </div>

            {error && (
              <Alert tone="danger" className="mt-2">
                {error}
              </Alert>
            )}

            <Button type="submit" block loading={loading} className="mt-3 h-11 rounded-md font-medium">
              Masuk
              {!loading && <Icon name="arrow-right" size={16} />}
            </Button>
          </form>

          <div className="mt-8 flex items-center justify-between border-t border-line pt-5 text-sm">
            <span className="flex items-center gap-1.5 text-muted">
              <Icon name="lock" size={14} /> Sesi aman, berakhir otomatis
            </span>
            <Link to="/" className="flex items-center gap-1 no-underline">
              <Icon name="arrow-left" size={14} /> Beranda
            </Link>
          </div>
        </main>
      </div>

      <p className="mt-6 mb-0 text-center text-sm text-muted">
        © {new Date().getFullYear()} TabMedik · Sistem informasi klinik pratama
      </p>
    </div>
  );
}
