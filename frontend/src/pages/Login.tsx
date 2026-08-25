import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { getUserByEmail } from "../api/usersApi";
import "../App.css";

function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("lisa@malmobygg.se");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    try {
      const user = await getUserByEmail(email);

      if (!user || user.password !== password) {
        setError("Fel e-post eller lösenord.");
        return;
      }

      localStorage.setItem("user", JSON.stringify(user));
      navigate("/dashboard");
    } catch {
      setError("Kunde inte ansluta till API:t.");
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="card">
          <div className="card-body">
            <div className="text-center">
              <div className="login-logo">SEB</div>
              <p className="subtitle">Företagsbetalningar</p>
            </div>

            {error && <div className="login-error">{error}</div>}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="email">E-post</label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="password">Lösenord</label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn-seb">
                Logga in
              </button>
            </form>
          </div>
        </div>

        <p className="footer-text">
          © 2024 SEB – Alla rättigheter förbehållna
        </p>
      </div>
    </div>
  );
}

export default Login;