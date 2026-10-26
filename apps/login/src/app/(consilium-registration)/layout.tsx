import "@/styles/consilium-registration.css";
import "@/styles/globals.scss";
import { Cormorant_Garamond, PT_Sans } from "next/font/google";
import Image from "next/image";
import Link from "next/link";

const sans = PT_Sans({
  weight: ["400", "700"],
  subsets: ["latin", "cyrillic"],
  variable: "--consilium-sans",
  display: "swap",
});
const serif = Cormorant_Garamond({
  weight: "600",
  subsets: ["latin", "cyrillic"],
  variable: "--consilium-serif",
  display: "swap",
});
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const metadata = { robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${sans.variable} ${serif.variable}`}>
      <body className="consilium-site">
        <header className="consilium-header">
          <a href="https://consiliumalterum.ru/" aria-label="Consilium Alterum — главная">
            <Image
              src={base + "/consilium/logo-white.svg"}
              alt="Consilium Alterum"
              width={204}
              height={64}
              priority
              unoptimized
            />
          </a>
          <nav aria-label="Основная навигация">
            <Link className="consilium-login-button" href="/loginname">
              Войти
            </Link>
            <Link className="consilium-button consilium-start-button" href="/registration">
              Начать работу
            </Link>
            <details className="consilium-menu">
              <summary aria-label="Открыть меню">
                <span />
                <span />
                <span />
              </summary>
              <div>
                <a href="https://consiliumalterum.ru/">Главная</a>
                <Link href="/registration">Регистрация</Link>
                <Link href="/invite">По приглашению</Link>
                <a href="https://consiliumalterum.ru/blog">Блог</a>
              </div>
            </details>
          </nav>
        </header>
        <main className="consilium-main">{children}</main>
        <footer className="consilium-footer">
          <p className="consilium-disclaimer">
            Не для экстренных ситуаций. Не является медицинским изделием. Не заменяет клиническое решение врача.
          </p>
          <div className="consilium-footer-top">
            <Image src={base + "/consilium/logo-white.svg"} alt="Consilium Alterum" width={180} height={56} unoptimized />
            <a href="https://consiliumalterum.ru/blog">Блог</a>
            <a href="mailto:hello@consiliumalterum.ru">hello@consiliumalterum.ru</a>
          </div>
          <div className="consilium-footer-legal">
            <a href="https://consiliumalterum.ru/terms">Пользовательское соглашение</a>
            <a href="https://consiliumalterum.ru/privacy">Политика обработки персональных данных</a>
            <a href="https://consiliumalterum.ru/consent">Согласие на обработку персональных данных</a>
            <span>© Consilium Alterum</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
