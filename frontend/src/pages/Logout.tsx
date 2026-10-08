import { LuArrowRight, LuCheck } from "react-icons/lu";
import { Link } from "react-router-dom";
import "../styles/logout.css";

export default function Logout() {
  return (
    <main className="logout-page">
      <section className="logout-card" aria-labelledby="logout-heading">
        <div className="logout-success-icon" aria-hidden="true">
          <LuCheck />
        </div>

        <h1 id="logout-heading">Du är nu utloggad</h1>
        <div className="logout-copy">
          <p>Tack för att du använder SEB Företagsbetalningar.</p>
          <p>Din session har avslutats.</p>
        </div>

        <Link className="logout-relogin-button" to="/">
          <span>Logga in igen</span>
          <LuArrowRight aria-hidden="true" />
        </Link>
      </section>
    </main>
  );
}
