import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./lib/auth";
import { AdminLayout } from "./components/layout/AdminLayout";
import { LandingPage } from "./pages/landing/LandingPage";
import { LoginPage } from "./pages/auth/LoginPage";
import { DashboardPage } from "./pages/dashboard/DashboardPage";
import { PasienFormPage, PasienListPage } from "./pages/pasien/PasienPages";
import { PasienDetailPage } from "./pages/pasien/PasienDetailPage";
import { RekamListPage } from "./pages/rekam/RekamListPage";
import { RekamDetailPage } from "./pages/rekam/RekamDetailPage";
import { ObatPage, PengeluaranPage, ResepPage, RiwayatObatPage } from "./pages/apotek/ApotekPages";
import { KuitansiPage, PembayaranPage } from "./pages/pembayaran/PembayaranPage";
import { DokterPage, IcdPage, PetugasPage, PoliPage, TindakanPage } from "./pages/master/MasterPages";
import { PermintaanPage } from "./pages/permintaan/PermintaanPage";
import { CompanyPicker } from "./components/CompanyPicker";
import { Alert, Spinner } from "./components/ui";

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function Protected({ children }: { children: React.ReactNode }) {
  const { loading, isAuthenticated, needsCompany } = useAuth();
  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (needsCompany)
    return (
      <div className="min-h-screen bg-page">
        <CompanyPicker open dismissible={false} />
      </div>
    );
  return <>{children}</>;
}

/** Hides a page from roles that have no menu for it; the API enforces the same rules. */
function Only({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const { hasRole } = useAuth();
  return hasRole(...roles) ? <>{children}</> : <Alert tone="warning">Halaman ini tidak tersedia untuk peran Anda.</Alert>;
}

const FRONT = ["admin", "pendaftaran"];
const PHARM = ["admin", "apotek"];
const ADMIN = ["admin"];

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/app"
              element={
                <Protected>
                  <AdminLayout />
                </Protected>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="pasien" element={<Only roles={FRONT}><PasienListPage /></Only>} />
              <Route path="pasien/baru" element={<Only roles={FRONT}><PasienFormPage /></Only>} />
              <Route path="pasien/:id" element={<PasienDetailPage />} />
              <Route path="pasien/:id/edit" element={<Only roles={FRONT}><PasienFormPage /></Only>} />
              <Route path="rekam" element={<RekamListPage />} />
              <Route path="rekam/:id" element={<RekamDetailPage />} />
              <Route path="apotek" element={<Only roles={PHARM}><ResepPage /></Only>} />
              <Route path="apotek/:id" element={<Only roles={PHARM}><PengeluaranPage /></Only>} />
              <Route path="obat" element={<Only roles={[...PHARM, "dokter"]}><ObatPage /></Only>} />
              <Route path="obat/riwayat" element={<Only roles={PHARM}><RiwayatObatPage /></Only>} />
              <Route path="permintaan-janji" element={<Only roles={FRONT}><PermintaanPage /></Only>} />
              <Route path="pembayaran" element={<Only roles={FRONT}><PembayaranPage /></Only>} />
              <Route path="pembayaran/:id/cetak" element={<Only roles={FRONT}><KuitansiPage /></Only>} />
              <Route path="master/poli" element={<Only roles={ADMIN}><PoliPage /></Only>} />
              <Route path="master/dokter" element={<Only roles={ADMIN}><DokterPage /></Only>} />
              <Route path="master/tindakan" element={<Only roles={ADMIN}><TindakanPage /></Only>} />
              <Route path="master/icd" element={<Only roles={ADMIN}><IcdPage /></Only>} />
              <Route path="master/petugas" element={<Only roles={ADMIN}><PetugasPage /></Only>} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
