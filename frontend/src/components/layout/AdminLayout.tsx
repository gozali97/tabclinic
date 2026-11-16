import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { CompanyPicker } from "../CompanyPicker";
import { PasswordModal } from "../PasswordModal";
import { ROLE_LABEL } from "../../lib/klinik";
import {
  cx,
  Dropdown,
  DropdownDivider,
  DropdownItem,
  Icon,
  PillInput,
  type IconName,
} from "../ui";

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  roles: string[] | null;
}

// Menu mengikuti SI-Shina (Dashboard, Pasien, Rekam Medis, Apotek, Pembayaran, Master Data) ditambah Permintaan Janji dari landing page.
const navGroups: { title: string; items: NavItem[] }[] = [
  {
    title: "",
    items: [{ to: "/app", label: "Dashboard", icon: "home", roles: null }],
  },
  {
    title: "Pelayanan",
    items: [
      { to: "/app/permintaan-janji", label: "Permintaan Janji", icon: "inbox", roles: ["admin", "pendaftaran"] },
      { to: "/app/pasien", label: "Data Pasien", icon: "users", roles: ["admin", "pendaftaran"] },
      { to: "/app/pasien/baru", label: "Pasien Baru", icon: "user-plus", roles: ["admin", "pendaftaran"] },
      { to: "/app/rekam", label: "Rekam Medis", icon: "clipboard", roles: ["admin", "pendaftaran", "dokter"] },
      { to: "/app/pembayaran", label: "Pembayaran", icon: "credit-card", roles: ["admin", "pendaftaran"] },
    ],
  },
  {
    title: "Apotek",
    items: [
      { to: "/app/obat", label: "Data Obat", icon: "archive", roles: ["admin", "apotek"] },
      { to: "/app/apotek", label: "Resep & Pemberian Obat", icon: "package", roles: ["admin", "apotek"] },
      { to: "/app/obat/riwayat", label: "Riwayat Keluar Obat", icon: "list", roles: ["admin", "apotek"] },
    ],
  },
  {
    title: "Master Data",
    items: [
      { to: "/app/master/poli", label: "Poli", icon: "grid", roles: ["admin"] },
      { to: "/app/master/dokter", label: "Dokter", icon: "user-check", roles: ["admin"] },
      { to: "/app/master/tindakan", label: "Tindakan", icon: "scissors", roles: ["admin"] },
      { to: "/app/master/icd", label: "ICD-10", icon: "book", roles: ["admin"] },
      { to: "/app/master/petugas", label: "Petugas", icon: "user", roles: ["admin"] },
    ],
  },
];

function Brand() {
  return (
    // From md up the brand sits on the blue sidebar column; on mobile it is on the white topbar.
    <NavLink to="/app" className="flex items-center gap-2 no-underline">
      <span className="flex size-9 items-center justify-center rounded-md bg-primary text-white md:bg-white md:text-primary">
        <Icon name="plus" size={20} />
      </span>
      <span className="text-[22px] font-medium text-dark md:text-white">
        Tab<span className="text-primary md:text-sidebar-label">Medik</span>
      </span>
    </NavLink>
  );
}

export function AdminLayout() {
  const { me, logout, hasRole } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  useEffect(() => setSidebarOpen(false), [pathname]);

  const name = me?.full_name || me?.email || "Pengguna";
  const role = me?.is_superadmin
    ? "Superadmin"
    : (me?.roles ?? []).map((r) => ROLE_LABEL[r] ?? r).join(", ") || "Pengguna";
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const groups = navGroups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => i.roles === null || hasRole(...i.roles)),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="min-h-screen bg-page">
      <a href="#main-content" className="skip-link">
        Lewati ke konten utama
      </a>

      {/* Topbar: header-position fixed, navbarbg skin6 */}
      <header className="fixed inset-x-0 top-0 z-50 flex h-20 border-b border-line bg-white">
        <div className="flex h-20 w-full items-center justify-between bg-white px-4 md:w-[260px] md:border-b md:border-white/10 md:bg-sidebar-bg md:px-[30px]">
          <button
            type="button"
            className="cursor-pointer p-2 text-body md:hidden"
            aria-label="Buka menu"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen((o) => !o)}
          >
            <Icon name={sidebarOpen ? "x" : "menu"} size={22} />
          </button>
          <Brand />
          <span className="w-10 md:hidden" />
        </div>

        <div className="hidden flex-1 items-center pr-2.5 pl-4 md:flex">
          <span className="max-w-[280px] truncate rounded-md border border-line bg-primary-soft px-3 py-1.5 text-sm font-medium text-primary-dark">
            <Icon
              name="briefcase"
              size={14}
              className="mr-1.5 -mt-0.5 text-primary"
            />
            {me?.company_name ?? "Belum memilih company"}
          </span>

          <div className="ml-auto flex items-center gap-2">
            {hasRole("admin", "pendaftaran") && <form
              className="hidden w-64 lg:block"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                const q = new FormData(e.currentTarget).get("q");
                navigate(
                  `/app/pasien${q ? `?q=${encodeURIComponent(String(q))}` : ""}`,
                );
              }}
            >
              <PillInput
                name="q"
                type="search"
                placeholder="Cari pasien"
                aria-label="Cari pasien"
                icon={<Icon name="search" size={18} />}
              />
            </form>}

            <Dropdown
              label="Menu pengguna"
              arrow
              className="min-w-[280px]"
              trigger={
                <span className="flex items-center px-[15px] leading-[80px]">
                  <span className="flex size-10 items-center justify-center rounded-full bg-primary text-sm font-medium text-white">
                    {initials}
                  </span>
                  <span className="ml-2 hidden lg:inline-block">
                    <span className="text-body">Halo, </span>
                    <span className="text-dark">{name}</span>
                    <Icon name="chevron-down" size={16} className="ml-1" />
                  </span>
                </span>
              }
            >
              <div className="border-b border-line px-4 py-3">
                <div className="truncate font-medium text-dark">{name}</div>
                <div className="truncate text-sm text-muted capitalize">
                  {role}
                </div>
              </div>
              {me?.is_superadmin && (
                <DropdownItem onClick={() => setPickerOpen(true)}>
                  <Icon name="repeat" size={16} /> Ganti company
                </DropdownItem>
              )}
              <DropdownItem onClick={() => setPasswordOpen(true)}>
                <Icon name="lock" size={16} /> Ganti password
              </DropdownItem>
              <DropdownDivider />
              <DropdownItem onClick={handleLogout}>
                <Icon name="power" size={16} /> Keluar
              </DropdownItem>
            </Dropdown>
          </div>
        </div>
      </header>

      {/* Sidebar: blue, full 260px, fixed */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={cx(
          "fixed top-0 bottom-0 z-40 w-[260px] bg-sidebar-bg pt-20 transition-[left] duration-200 ease-in",
          sidebarOpen ? "left-0" : "-left-[260px] md:left-0",
        )}
      >
        <nav
          aria-label="Menu utama"
          className="h-full overflow-y-auto pt-[30px] pb-6"
        >
          <ul className="m-0 list-none p-0">
            {groups.map((g, gi) => (
              <li key={g.title || gi}>
                {gi > 0 && <div className="mx-[30px] mt-3 mb-4 h-px bg-white/15" />}
                {g.title && (
                  <div className="mb-1 px-[30px] text-xs leading-[30px] font-semibold tracking-wider text-sidebar-label uppercase">
                    {g.title}
                  </div>
                )}
                <ul className="m-0 list-none p-0">
                  {g.items.map((item) => (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end
                        className={({ isActive }) =>
                          cx(
                            "mx-3 flex items-center gap-2 rounded-md px-[18px] py-2.5 leading-[27px] whitespace-nowrap no-underline transition-colors",
                            isActive
                              ? "bg-white font-medium text-primary-dark! shadow-sm hover:text-primary-dark!"
                              : "text-sidebar hover:bg-white/10 hover:text-white!",
                          )
                        }
                      >
                        {({ isActive }) => (
                          <>
                            <Icon
                              name={item.icon}
                              size={20}
                              className={
                                isActive ? "text-primary" : "text-sidebar-icon"
                              }
                            />
                            <span className="truncate">{item.label}</span>
                          </>
                        )}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
            <li>
              <div className="mx-[30px] mt-3 mb-4 h-px bg-white/15" />
              <button
                type="button"
                onClick={handleLogout}
                className="group mx-3 flex w-[calc(100%-24px)] cursor-pointer items-center gap-2 rounded-md px-[18px] py-2.5 leading-[27px] text-sidebar transition-colors hover:bg-danger hover:text-white"
              >
                <Icon name="log-out" size={20} className="text-sidebar-icon group-hover:text-white" />
                Keluar
              </button>
            </li>
          </ul>
        </nav>
      </aside>

      {/* Page wrapper */}
      <div className="pt-20 md:ml-[260px]">
        <div className="bg-[#fef5e2] px-4 py-2 text-center text-sm text-[#78470a] md:hidden">
          Data demo — bukan data pasien
        </div>
        <main
          id="main-content"
          tabIndex={-1}
          className="min-h-[calc(100vh-210px)] p-4 focus:outline-none sm:p-[35px]"
        >
          <Outlet />
        </main>
        <footer className="px-5 py-[15px] text-center text-muted">
          TabMedik · Workspace klinik
        </footer>
      </div>
      <PasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
      {me?.is_superadmin && (
        <CompanyPicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          dismissible
        />
      )}
    </div>
  );
}
