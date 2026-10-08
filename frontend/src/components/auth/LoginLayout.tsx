import type { ReactNode } from "react";
import { FiPhone } from "react-icons/fi";
import buildingImage from "../../assets/seb_background_img.png";
import whiteLogo from "../../assets/seb_logo_white.png";
import "../../styles/login.css";

interface LoginLayoutProps {
  children: ReactNode;
  labelledBy: string;
  brandDescription?: string;
}

export default function LoginLayout({
  children,
  labelledBy,
  brandDescription = "Hantera dina företagsbetalningar säkert, enkelt och effektivt – allt på ett ställe. Skapa smidiga flöden med Payment Control.",
}: LoginLayoutProps) {
  return (
    <main className="login-page">
      <section className="login-brand" aria-label="SEB Företagsbetalningar">
        <img className="login-brand-image" src={buildingImage} alt="" />
        <img className="login-brand-logo" src={whiteLogo} alt="SEB" />

        <div className="login-brand-copy">
          <p className="login-eyebrow">SMARTER PAYMENTS. A STRONGER TOMORROW.</p>
          <h2>Efficient payments for a<br />stronger business</h2>
          <p className="login-brand-description">{brandDescription}</p>
        </div>

        <ul className="login-highlights">
          <li><strong>Säkra transaktioner</strong><span>Bank-grade säkerhet</span></li>
          <li><strong>Effektiv hantering</strong><span>Automatisera flöden</span></li>
          <li><strong>En hållbar framtid</strong><span>Långsiktigt partnerskap</span></li>
        </ul>
      </section>

      <section className="login-access" aria-labelledby={labelledBy}>
        <div className="login-form-content">{children}</div>
        <p className="login-support">
          <FiPhone aria-hidden="true" />
          <span>Behöver du hjälp? Kontakta vår support på <a href="tel:0771365365">077-136 53 65</a></span>
        </p>
      </section>
    </main>
  );
}
