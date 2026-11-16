import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import AOS from "aos";
import "aos/dist/aos.css";
import { api } from "../../lib/api";
import s from "./LandingPage.module.css";

// Mirrors the app: Poli Umum and Poli Gigi take visits; apotek and pembayaran are steps of the same visit.
const services = [
  {
    name: "Konsultasi Umum",
    icon: "stethoscope",
    description:
      "Pemeriksaan dokter umum di Poli Umum, dari anamnesa sampai diagnosa dan tindakan.",
    detail: "Poli Umum · Dokter umum",
    bookable: true,
  },
  {
    name: "Kesehatan Gigi",
    icon: "tooth",
    description:
      "Pemeriksaan gigi dan mulut di Poli Gigi, dicatat per gigi pada odontogram.",
    detail: "Poli Gigi · Dokter gigi",
    bookable: true,
  },
  {
    name: "Apotek Klinik",
    icon: "pill",
    description:
      "Obat sesuai resep dokter disiapkan dan diserahkan langsung oleh apotek klinik.",
    detail: "Resep · Penyerahan obat",
    bookable: false,
  },
  {
    name: "Pembayaran & BPJS",
    icon: "card",
    description:
      "Bayar tunai, transfer, kartu debit, atau QRIS dengan kuitansi. Pasien BPJS tidak melalui kasir.",
    detail: "Umum · Jaminan Kesehatan",
    bookable: false,
  },
];
const bookableServices = services.filter((item) => item.bookable).map((item) => item.name);
const articles = [
  {
    category: "KENALI TUBUH",
    time: "4 menit baca",
    title: "Keluhan berulang? Siapkan catatan sebelum konsultasi.",
    description:
      "Hal sederhana yang membantu Anda menceritakan kondisi dengan lebih jelas.",
    image: [80, 4371, 408, 255],
    alt: "Ilustrasi seseorang menulis catatan di meja dekat jendela.",
    body: "Setiap cerita layak didengar. Jika ada hal yang ingin Anda bicarakan saat konsultasi, siapkan catatan agar pertanyaan Anda tidak terlewat. Catatan ini dapat menjadi awal percakapan dengan dokter.",
  },
  {
    category: "KEBIASAAN SEHAT",
    time: "3 menit baca",
    title: "Bergerak lebih sering, mulai dari langkah kecil.",
    description:
      "Ide aktivitas ringan yang dapat disesuaikan dengan rutinitas sehari-hari.",
    image: [516, 4371, 408, 255],
    alt: "Ilustrasi dua orang berjalan bersama di jalur taman.",
    body: "Rutinitas setiap orang berbeda. Bicarakan kebiasaan dan kebutuhan Anda saat berkonsultasi agar langkah berikutnya dapat disesuaikan dengan kondisi Anda.",
  },
  {
    category: "GIGI & MULUT",
    time: "4 menit baca",
    title: "Rutinitas kecil untuk merawat senyum Anda.",
    description:
      "Kenali kembali kebiasaan dasar menjaga kebersihan gigi dan mulut.",
    image: [952, 4371, 408, 255],
    alt: "Ilustrasi sikat gigi dan perlengkapan perawatan di wastafel.",
    body: "Perawatan dimulai dari memahami kebutuhan Anda. Saat berkonsultasi, ceritakan kebiasaan sehari-hari dan pertanyaan tentang kesehatan gigi serta mulut kepada dokter.",
  },
];
const questions = [
  [
    "Bagaimana cara membuat janji?",
    "Pilih “Buat Janji”, isi nama, nomor WhatsApp, poli, dan preferensi hari. Tim klinik akan menghubungi Anda untuk konfirmasi. Formulir ini belum mengunci jadwal.",
  ],
  [
    "Apakah saya bisa datang tanpa membuat janji?",
    "Bisa. Petugas pendaftaran akan mendaftarkan Anda ke Poli Umum atau Poli Gigi beserta dokternya, lalu Anda menunggu giliran diperiksa.",
  ],
  [
    "Apa yang perlu dibawa saat kunjungan pertama?",
    "Bawa kartu identitas, kartu BPJS Kesehatan bila memakai jaminan, dan daftar obat yang sedang diminum. Petugas akan mencatat data diri, membuatkan nomor rekam medis, dan meminta persetujuan umum (general consent).",
  ],
  [
    "Bagaimana biaya pemeriksaan dihitung?",
    "Tagihan terdiri dari biaya pemeriksaan poli, tindakan yang dilakukan dokter, dan obat yang diberikan apotek. Pembayaran bisa tunai, transfer, kartu debit, atau QRIS, dan Anda menerima kuitansi.",
  ],
  [
    "Apakah bisa memakai BPJS Kesehatan?",
    "Bisa bila klinik melayani BPJS. Saat mendaftar, sampaikan bahwa Anda memakai Jaminan Kesehatan dan tunjukkan kartu BPJS. Setelah menerima obat, kunjungan pasien BPJS selesai tanpa melalui kasir.",
  ],
  [
    "Apakah TabMedik melayani kondisi darurat?",
    "Tidak. Untuk kondisi darurat, segera menuju IGD terdekat atau hubungi layanan darurat setempat tanpa menunggu konfirmasi melalui website.",
  ],
];

function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    arrow: <path d="M6 18 18 6M6 6h12v12" />,
    chat: (
      <>
        <path d="M4 4h16v12H9l-5 4V4Z" />
        <path d="M8 8h8M8 12h5" />
      </>
    ),
    heart: (
      <path d="M20.4 5.6a5.2 5.2 0 0 0-7.4 0L12 6.7l-1-1.1a5.2 5.2 0 0 0-7.4 7.4L12 21l8.4-8a5.2 5.2 0 0 0 0-7.4Z" />
    ),
    clipboard: (
      <>
        <rect x="5" y="4" width="14" height="18" rx="2" />
        <path d="M9 4V2h6v2M9 10h6M9 14h6M9 18h4" />
      </>
    ),
    shield: (
      <>
        <path d="m12 2 8 3v6c0 5-8 11-8 11S4 16 4 11V5l8-3Z" />
        <path d="m8 11 3 3 5-6" />
      </>
    ),
    stethoscope: (
      <>
        <path d="M5 3v6a5 5 0 0 0 10 0V3M3 3h4M13 3h4M10 14v3a4 4 0 0 0 8 0v-3" />
        <circle cx="18" cy="11" r="3" />
      </>
    ),
    tooth: (
      <path d="M12 5C8 1 3 4 4 9c1 3 1 12 4 12 2 0 1-7 4-7s2 7 4 7c3 0 3-9 4-12 1-5-4-8-8-4Zm0 0 3 2" />
    ),
    ear: (
      <path d="M6 10a6 6 0 1 1 11 3c-2 2-4 2-4 5a3 3 0 0 1-6 0M9 10a3 3 0 0 1 6 0c0 3-4 2-4 5" />
    ),
    pin: (
      <>
        <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z" />
        <circle cx="12" cy="10" r="3" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 6v6l4 2" />
      </>
    ),
    pill: (
      <>
        <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" />
        <path d="m8.5 8.5 7 7" />
      </>
    ),
    card: (
      <>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20M6 15h4" />
      </>
    ),
    phone: (
      <path d="m7 3 3 4-2 3c1 3 3 5 6 6l3-2 4 3c-1 6-5 5-9 3C6 17 2 11 3 6c0-2 2-3 4-3Z" />
    ),
  };
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.heart}
    </svg>
  );
}
const SPRITE = { src: "/landing/reference.png", w: 1440, h: 6866 };

/**
 * One crop of the landing sprite, painted as a background so the browser rasterizes
 * only the visible box. The old approach (a ~17,000px-tall scaled <img> shifted inside
 * an overflow box) rendered blank once AOS put the box on a GPU layer.
 * Percent background-position p places the crop at offset p·(box − image), which
 * solves to x/(spriteW − cropW) and y/(spriteH − cropH), independent of box size.
 */
function Photo({
  area,
  alt,
  className = "",
  aos,
}: {
  area: number[];
  alt: string;
  /** Kept for call-site compatibility; the shared sprite loads once either way. */
  eager?: boolean;
  className?: string;
  aos?: { "data-aos"?: string; "data-aos-delay"?: number };
}) {
  const [x, y, width, height] = area;
  return (
    <div
      {...aos}
      role="img"
      aria-label={alt}
      className={`${s.photo} ${className}`}
      style={{
        aspectRatio: `${width} / ${height}`,
        backgroundImage: `url(${SPRITE.src})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${(SPRITE.w / width) * 100}% auto`,
        backgroundPosition: `${(x / (SPRITE.w - width)) * 100}% ${(y / (SPRITE.h - height)) * 100}%`,
      }}
    />
  );
}
function Brand({ footer = false }: { footer?: boolean }) {
  return (
    <a
      href="#beranda"
      className={`${s.brand} ${footer ? s.brandLight : ""}`}
      aria-label="TabMedik, kembali ke awal"
    >
      <span className={s.brandMark} aria-hidden="true" />
      <span>
        Tab<span className={s.brandAccent}>Medik</span>
      </span>
    </a>
  );
}

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [service, setService] = useState("");
  const [article, setArticle] = useState(articles[0]);
  const menuButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menuOpen) {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menuOpen]);
  useEffect(() => {
    // Scroll-reveal; disabled entirely when the visitor prefers reduced motion.
    AOS.init({
      once: true,
      duration: 700,
      easing: "ease-out-cubic",
      offset: 60,
      disable: () =>
        window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    });
    const refresh = () => AOS.refresh();
    window.addEventListener("load", refresh);
    return () => window.removeEventListener("load", refresh);
  }, []);
  const openArticle = (item: (typeof articles)[number]) => {
    setArticle(item);
    dialog.current?.showModal();
  };

  return (
    <div id="beranda" className={s.landing}>
      <a href="#main-content" className={s.skip}>
        Langsung ke konten utama
      </a>
      <header className={s.header}>
        <div className={`${s.wrap} ${s.navbar}`}>
          <Brand />
          <nav
            id="landing-menu"
            className={`${s.nav} ${menuOpen ? s.navOpen : ""}`}
            aria-label="Navigasi utama"
          >
            {[
              ["#tentang", "Tentang Kami"],
              ["#layanan", "Layanan"],
              ["#tim", "Tim Dokter"],
              ["#informasi", "Informasi Kesehatan"],
            ].map(([href, text]) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)}>
                {text}
              </a>
            ))}
          </nav>
          <div className={s.navActions}>
            <a className={`${s.primary} ${s.navCta}`} href="#buat-janji">
              Buat Janji <Icon name="arrow" />
            </a>
            <button
              ref={menuButton}
              className={s.menuButton}
              type="button"
              aria-expanded={menuOpen}
              aria-controls="landing-menu"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? "Tutup" : "Menu"}
              <span aria-hidden="true">{menuOpen ? "×" : "☰"}</span>
            </button>
          </div>
        </div>
      </header>

      <main id="main-content">
        <section className={s.hero} aria-labelledby="hero-title">
          <div className={s.wrap}>
            <div className={s.heroGrid}>
              <div className={s.heroCopy} data-aos="fade-up">
                <h1 id="hero-title">
                  Sehat dimulai
                  <br />
                  dari rasa
                  <br />
                  didengarkan.
                </h1>
                <p className={s.heroDescription}>
                  Ceritakan keluhan Anda. Mari pahami kebutuhan kesehatan dan
                  temukan langkah perawatan yang tepat, bersama TabMedik.
                </p>
                <div className={s.heroActions}>
                  <a className={s.primary} href="#buat-janji">
                    Buat Janji <Icon name="arrow" />
                  </a>
                  <a className={s.textLink} href="#layanan">
                    Lihat Layanan <span aria-hidden="true">↓</span>
                  </a>
                </div>
                <p className={s.finePrint}>
                  Pilih layanan, ajukan waktu, lalu konfirmasi kunjungan.
                </p>
              </div>
              <figure data-aos="fade-left" data-aos-delay="150">
                <Photo
                  area={[780, 154, 580, 592]}
                  alt="Ilustrasi dokter mendengarkan pasien dalam ruang konsultasi yang hangat."
                  eager
                  className={s.heroPhoto}
                />
                <figcaption className={s.srOnly}>
                  Anda bukan sekadar keluhan. Setiap cerita layak mendapat
                  perhatian.
                </figcaption>
              </figure>
            </div>
            <div className={s.benefits}>
              {[
                [
                  "chat",
                  "Konsultasi yang terbuka",
                  "Ruang untuk bertanya tanpa ragu.",
                ],
                [
                  "heart",
                  "Berpusat pada Anda",
                  "Kebutuhan Anda menjadi titik awal.",
                ],
                [
                  "clipboard",
                  "Langkah yang lebih jelas",
                  "Pahami rencana perawatan Anda.",
                ],
              ].map(([icon, title, text], i) => (
                <div key={title} data-aos="fade-up" data-aos-delay={i * 100}>
                  <Icon name={icon} />
                  <span>
                    <strong>{title}</strong>
                    <small>{text}</small>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="tentang" className={s.about} aria-labelledby="about-title">
          <div className={`${s.wrap} ${s.aboutGrid}`}>
            <Photo
              area={[80, 1014, 500, 420]}
              alt="Ilustrasi ruang tunggu klinik dengan cahaya alami, tanaman, dan material kayu."
              aos={{ "data-aos": "fade-right" }}
            />
            <div data-aos="fade-left" data-aos-delay="100">
              <p className={s.eyebrow}>TENTANG TABMEDIK</p>
              <h2 id="about-title">
                Perawatan yang baik
                <br />
                terasa lebih personal.
              </h2>
              <p>
                Kami membayangkan pengalaman berobat yang lebih manusiawi:
                didengarkan dengan saksama, mendapat penjelasan yang mudah
                dipahami, dan dilibatkan dalam setiap keputusan perawatan.
              </p>
              <p>
                TabMedik dirancang sebagai teman untuk kebutuhan kesehatan
                sehari-hari, dari konsultasi awal hingga rencana tindak lanjut.
              </p>
              <blockquote>Lebih dari merawat. Kami ingin memahami.</blockquote>
            </div>
          </div>
        </section>

        <section
          id="layanan"
          className={s.services}
          aria-labelledby="services-title"
        >
          <div className={s.wrap}>
            <div className={s.sectionHeading} data-aos="fade-up">
              <div>
                <p className={s.eyebrow}>LAYANAN KAMI</p>
                <h2 id="services-title">
                  Untuk kebutuhan sehat
                  <br />
                  Anda, setiap hari.
                </h2>
              </div>
              <p>
                Dua poli untuk pemeriksaan, dilanjutkan apotek dan pembayaran
                dalam satu kunjungan.
              </p>
            </div>
            <div className={s.servicesGrid}>
              {services.map((item, i) => (
                <a
                  href={item.bookable ? "#buat-janji" : "#alur"}
                  key={item.name}
                  data-aos="fade-up"
                  data-aos-delay={i * 100}
                  className={s.serviceCard}
                  onClick={() => item.bookable && setService(item.name)}
                >
                  <div className={s.serviceTop}>
                    <span className={s.iconTile}>
                      <Icon name={item.icon} />
                    </span>
                    <Icon name="arrow" />
                  </div>
                  <h3>{item.name}</h3>
                  <p>{item.description}</p>
                  <small>{item.detail}</small>
                </a>
              ))}
            </div>
            <p className={s.sectionNote}>
              Jadwal praktik, daftar tindakan, obat, dan tarif mengikuti
              informasi resmi klinik.
            </p>
          </div>
        </section>

        <section className={s.values} aria-labelledby="values-title">
          <div className={s.wrap}>
            <div className={s.sectionHeading} data-aos="fade-up">
              <div>
                <p className={s.eyebrow}>YANG KAMI UTAMAKAN</p>
                <h2 id="values-title">
                  Bukan hanya lebih sehat.
                  <br />
                  Juga lebih tenang.
                </h2>
              </div>
              <p>
                Hubungan yang baik dimulai dari rasa percaya. Inilah pengalaman
                yang ingin kami hadirkan.
              </p>
            </div>
            <div className={s.valuesGrid}>
              {[
                [
                  "ear",
                  "Didengar dengan saksama",
                  "Cerita, kekhawatiran, dan pertanyaan Anda adalah bagian penting dari konsultasi.",
                ],
                [
                  "chat",
                  "Dijelaskan dengan sederhana",
                  "Informasi yang jelas membantu Anda memahami pilihan dan langkah perawatan.",
                ],
                [
                  "shield",
                  "Diputuskan bersama",
                  "Rencana perawatan dibicarakan dengan mempertimbangkan kebutuhan dan kenyamanan Anda.",
                ],
              ].map(([icon, title, text], i) => (
                <div key={title} data-aos="fade-up" data-aos-delay={i * 120}>
                  <Icon name={icon} />
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="tim" className={s.team} aria-labelledby="team-title">
          <div className={s.wrap}>
            <div className={s.sectionHeading} data-aos="fade-up">
              <div>
                <p className={s.eyebrow}>TIM DOKTER</p>
                <h2 id="team-title">
                  Kenali orang di balik
                  <br />
                  perawatan Anda.
                </h2>
              </div>
              <div className={s.teamNote}>
                <p className={s.eyebrow}>GAMBARAN TIM · PROFIL ILUSTRATIF</p>
                <p>
                  Nama, profil, dan jadwal praktik dokter akan ditampilkan
                  setelah dikonfirmasi oleh klinik.
                </p>
              </div>
            </div>
            <div className={s.teamGrid}>
              {[
                ["Dokter Umum", "Poli Umum · keluhan & kesehatan sehari-hari", "Konsultasi Umum"],
                ["Dokter Gigi", "Poli Gigi · kesehatan gigi & mulut", "Kesehatan Gigi"],
              ].map(([title, text, selected], index) => (
                <a
                  key={title}
                  href="#buat-janji"
                  data-aos="fade-up"
                  data-aos-delay={index * 120}
                  className={s.doctor}
                  onClick={() => setService(selected)}
                >
                  <Photo
                    area={[80 + index * 436, 3080, 408, 350]}
                    alt={`Profil ilustratif ${title.toLowerCase()}, bukan identitas dokter yang sudah dikonfirmasi.`}
                  />
                  <div className={s.doctorCaption}>
                    <div>
                      <h3>{title}</h3>
                      <p>{text}</p>
                    </div>
                    <span className={s.roundArrow}>
                      <Icon name="arrow" />
                    </span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section id="alur" className={s.steps} aria-labelledby="steps-title">
          <div className={s.wrap}>
            <div className={s.sectionHeading} data-aos="fade-up">
              <div>
                <p className={s.eyebrow}>ALUR KUNJUNGAN</p>
                <h2 id="steps-title">Satu kunjungan, empat langkah.</h2>
              </div>
              <a className={s.outline} href="#buat-janji">
                Buat Janji <Icon name="arrow" />
              </a>
            </div>
            <ol className={s.stepsGrid}>
              {[
                [
                  "Pendaftaran",
                  "Petugas mencatat data Anda dan keluhan, lalu mendaftarkan ke Poli Umum atau Poli Gigi.",
                ],
                [
                  "Pemeriksaan dokter",
                  "Dokter memeriksa, menetapkan diagnosa, melakukan tindakan, dan menulis resep.",
                ],
                [
                  "Ambil obat",
                  "Apotek klinik menyiapkan dan menyerahkan obat sesuai resep dokter.",
                ],
                [
                  "Pembayaran",
                  "Pasien umum membayar dan menerima kuitansi. Pasien BPJS langsung selesai.",
                ],
              ].map(([title, text], index) => (
                <li
                  key={title}
                  data-aos="fade-up"
                  data-aos-delay={index * 100}
                >
                  <span>0{index + 1}</span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          id="informasi"
          className={s.articles}
          aria-labelledby="articles-title"
        >
          <div className={s.wrap}>
            <div className={s.sectionHeading} data-aos="fade-up">
              <div>
                <p className={s.eyebrow}>INFORMASI KESEHATAN</p>
                <h2 id="articles-title">
                  Bacaan ringan,
                  <br />
                  bekal hidup lebih sehat.
                </h2>
              </div>
              <a className={s.textLink} href="#daftar-artikel">
                Semua Artikel <Icon name="arrow" />
              </a>
            </div>
            <div id="daftar-artikel" className={s.articlesGrid}>
              {articles.map((item, i) => (
                <article
                  key={item.title}
                  data-aos="fade-up"
                  data-aos-delay={i * 120}
                >
                  <button
                    className={s.articleImage}
                    type="button"
                    aria-label={`Baca: ${item.title}`}
                    onClick={() => openArticle(item)}
                  >
                    <Photo area={item.image} alt={item.alt} />
                  </button>
                  <div className={s.articleMeta}>
                    <span>{item.category}</span>
                    <span>{item.time}</span>
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  <button
                    type="button"
                    className={s.textLink}
                    onClick={() => openArticle(item)}
                  >
                    Baca selengkapnya <Icon name="arrow" />
                  </button>
                </article>
              ))}
            </div>
            <p className={s.sectionNote}>
              Contoh konten edukasi. Informasi umum tidak menggantikan
              konsultasi, diagnosis, atau saran medis dari dokter.
            </p>
          </div>
        </section>

        <section id="faq" className={s.faq} aria-labelledby="faq-title">
          <div className={`${s.wrap} ${s.faqGrid}`}>
            <div data-aos="fade-right">
              <p className={s.eyebrow}>PERTANYAAN UMUM</p>
              <h2 id="faq-title">
                Sebelum datang,
                <br />
                mari cari tahu.
              </h2>
              <p>
                Beberapa hal yang mungkin ingin Anda ketahui sebelum memulai
                perawatan.
              </p>
              <a className={s.textLink} href="#buat-janji">
                <Icon name="chat" />
                Masih punya pertanyaan?
              </a>
            </div>
            <div className={s.faqList} data-aos="fade-left" data-aos-delay="100">
              {questions.map(([question, answer], index) => (
                <div
                  key={question}
                  className={`${s.faqItem} ${openFaq === index ? s.faqOpen : ""}`}
                >
                  <h3>
                    <button
                      type="button"
                      aria-expanded={openFaq === index}
                      aria-controls={`faq-answer-${index}`}
                      onClick={() =>
                        setOpenFaq(openFaq === index ? null : index)
                      }
                    >
                      {question}
                      <span aria-hidden="true">
                        {openFaq === index ? "−" : "+"}
                      </span>
                    </button>
                  </h3>
                  <div id={`faq-answer-${index}`} hidden={openFaq !== index}>
                    <p>{answer}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          id="buat-janji"
          className={s.contact}
          aria-labelledby="contact-title"
        >
          <div className={s.wrap}>
            <div className={s.contactGrid}>
              <div className={s.contactCopy} data-aos="fade-right">
                <p className={s.eyebrow}>KAMI SIAP MENDENGARKAN</p>
                <h2 id="contact-title">
                  Langkah sehat Anda
                  <br />
                  bisa dimulai di sini.
                </h2>
                <p>
                  Rencanakan waktu untuk diri sendiri. Sampaikan kebutuhan Anda
                  dan pilih waktu yang paling nyaman.
                </p>
                <div className={s.contactDetails}>
                  <div>
                    <Icon name="phone" />
                    <h3>Kontak resmi</h3>
                    <p>
                      Nomor telepon dan WhatsApp akan ditampilkan oleh klinik.
                    </p>
                  </div>
                  <div>
                    <Icon name="pin" />
                    <h3>Lokasi klinik</h3>
                    <p>Alamat dan panduan menuju klinik menunggu konfirmasi.</p>
                  </div>
                  <div className={s.hours}>
                    <Icon name="clock" />
                    <h3>Jam operasional</h3>
                    {["Senin – Jumat", "Sabtu", "Minggu & hari libur"].map(
                      (day) => (
                        <div key={day}>
                          <span>{day}</span>
                          <span>Menunggu konfirmasi</span>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              </div>
              <VisitForm service={service} onServiceChange={setService} />
            </div>
            <div className={s.emergency} data-aos="fade-up">
              <Icon name="shield" />
              <p>
                Untuk kondisi darurat, segera menuju IGD terdekat atau hubungi
                layanan darurat setempat. Jangan menunggu konfirmasi janji
                melalui website.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className={s.footer}>
        <div className={s.wrap}>
          <div className={s.footerGrid}>
            <div>
              <Brand footer />
              <p>
                Ruang yang hangat untuk memulai
                <br />
                langkah sehat Anda.
              </p>
            </div>
            <div>
              <h3>Kenali TabMedik</h3>
              <a href="#tentang">Tentang Kami</a>
              <a href="#layanan">Layanan</a>
              <a href="#tim">Tim Dokter</a>
            </div>
            <div>
              <h3>Untuk Anda</h3>
              <a href="#alur">Alur Kunjungan</a>
              <a href="#informasi">Informasi Kesehatan</a>
              <a href="#faq">Pertanyaan Umum</a>
            </div>
            <a
              href="#beranda"
              className={s.backTop}
              aria-label="Kembali ke atas"
            >
              <span>↑</span>Kembali ke atas
            </a>
          </div>
          <div className={s.footerBottom}>
            <span>© {new Date().getFullYear()} TabMedik. Konsep website.</span>
            <span>
              Informasi layanan, tim, dan operasional menunggu konfirmasi
              klinik. <Link to="/login">Masuk staf</Link>
            </span>
          </div>
        </div>
      </footer>

      <dialog
        ref={dialog}
        className={s.articleDialog}
        aria-labelledby="article-dialog-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div>
          <button
            type="button"
            className={s.dialogClose}
            onClick={() => dialog.current?.close()}
            aria-label="Tutup artikel"
          >
            ×
          </button>
          <p className={s.eyebrow}>{article.category}</p>
          <h2 id="article-dialog-title">{article.title}</h2>
          <Photo area={article.image} alt={article.alt} />
          <p>{article.description}</p>
          <p>{article.body}</p>
          <p className={s.sectionNote}>
            Contoh konten edukasi umum. Informasi ini tidak menggantikan
            konsultasi dengan dokter.
          </p>
          <a
            href="#buat-janji"
            className={s.primary}
            onClick={() => dialog.current?.close()}
          >
            Ajukan konsultasi <Icon name="arrow" />
          </a>
        </div>
      </dialog>
    </div>
  );
}

function requestKey() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
function VisitForm({
  service,
  onServiceChange,
}: {
  service: string;
  onServiceChange: (value: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const key = useRef("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    if (!key.current) key.current = requestKey();
    setLoading(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      await api.post("/visit-requests", {
        idempotency_key: key.current,
        full_name: data.get("full_name"),
        phone: data.get("phone"),
        service,
        preferred_day: data.get("preferred_day"),
        consent: data.get("consent") === "on",
      });
      setSuccess(true);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Permintaan belum terkirim. Periksa koneksi lalu coba lagi.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className={s.bookingCard} data-aos="fade-left" data-aos-delay="100">
      <h3>Buat janji kunjungan</h3>
      <p>Isi preferensi Anda untuk memulai percakapan.</p>
      {success ? (
        <div className={s.formSuccess} role="status">
          <Icon name="clipboard" />
          <h4>Permintaan kunjungan tercatat.</h4>
          <p>
            Jadwal belum dikonfirmasi. Tim klinik akan menindaklanjuti
            preferensi kunjungan Anda.
          </p>
          <button
            type="button"
            className={s.outline}
            onClick={() => {
              setSuccess(false);
              key.current = "";
            }}
          >
            Ajukan kunjungan lain
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className={s.bookingForm}>
          <label>
            Nama lengkap
            <input
              name="full_name"
              autoComplete="name"
              placeholder="Tuliskan nama Anda"
              required
              minLength={2}
              maxLength={100}
            />
          </label>
          <label>
            Nomor WhatsApp
            <input
              name="phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              placeholder="Nomor yang dapat dihubungi"
              required
              minLength={8}
              maxLength={24}
            />
          </label>
          <div className={s.formColumns}>
            <label>
              Poli
              <select
                name="service"
                value={service}
                onChange={(event) => onServiceChange(event.target.value)}
                required
              >
                <option value="">Pilih poli</option>
                {bookableServices.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
            <label>
              Preferensi hari
              <select name="preferred_day" defaultValue="" required>
                <option value="">Pilih hari</option>
                {[
                  "Senin",
                  "Selasa",
                  "Rabu",
                  "Kamis",
                  "Jumat",
                  "Sabtu",
                  "Minggu",
                ].map((day) => (
                  <option key={day}>{day}</option>
                ))}
              </select>
            </label>
          </div>
          <label className={s.consent}>
            <input name="consent" type="checkbox" required />
            <span>
              Saya bersedia dihubungi untuk konfirmasi jadwal kunjungan.
            </span>
          </label>
          {error && (
            <p className={s.formError} role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            className={s.primary}
            disabled={loading}
            aria-busy={loading}
          >
            {loading ? "Mengirim permintaan…" : "Ajukan Jadwal"}
            {loading ? (
              <span className={s.spinner} aria-hidden="true" />
            ) : (
              <Icon name="arrow" />
            )}
          </button>
          <p className={s.formNote}>
            Formulir pengajuan, bukan diagnosis atau janji yang pasti. Jadwal
            dan detail perawatan akan dikonfirmasi klinik.
          </p>
        </form>
      )}
    </div>
  );
}
