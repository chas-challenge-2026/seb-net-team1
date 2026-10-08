import { FiArrowRight, FiCheck } from "react-icons/fi";
import { Link } from "react-router-dom";
import LoginLayout from "../components/auth/LoginLayout";
import "../styles/logout.css";

export default function Logout() {
  return (
    <LoginLayout
      labelledBy="logout-heading"
      brandDescription="Hantera dina företagsbetalningar säkert, enkelt och effektivt – allt på ett ställe. SEB Företagsbetalningar."
    >
      <section className="logout-content" aria-labelledby="logout-heading">
        <div className="logout-success-icon" aria-hidden="true">
          <FiCheck />
        </div>

        <h1 id="logout-heading">Du är nu utloggad</h1>
        <div className="logout-copy">
          <p>Tack för att du använder SEB Företagsbetalningar.</p>
          <p>Din session har avslutats.</p>
        </div>

        <Link className="login-submit logout-relogin-button" to="/">
          <span>Logga in igen</span>
          <FiArrowRight aria-hidden="true" />
        </Link>
      </section>
    </LoginLayout>
  );
}
