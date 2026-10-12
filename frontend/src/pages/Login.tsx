import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiArrowRight, FiEye, FiEyeOff, FiLock, FiUser } from "react-icons/fi";
import { login, LoginError } from "../api/usersApi";
import AuthFeedback from "../components/auth/AuthFeedback";
import LoginLayout from "../components/auth/LoginLayout";

function Login() {
  const navigate = useNavigate();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [sebIdPending, setSebIdPending] = useState(false);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setError("");
    setSebIdPending(false);
    setIsSubmitting(true);

    try {
      const response = await login(email, password);

      localStorage.setItem("user", JSON.stringify(response.user));

      navigate("/dashboard");
    } catch (error) {
      setError(error instanceof LoginError
        ? error.message
        : "Det gick inte att logga in. Försök igen.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <LoginLayout labelledBy="login-title">
      <h1 id="login-title" ref={headingRef} tabIndex={-1}>Välkommen tillbaka</h1>
      <p className="login-intro">
        Logga in för att komma åt ditt företags betalningscenter.
      </p>

      <form className="login-form" onSubmit={handleSubmit} aria-busy={isSubmitting}>
        {error && <AuthFeedback kind="error" id="login-error" message={error} />}

        <div className="login-field">
          <label htmlFor="email">Användarnamn</label>
          <div className="login-input-wrap">
            <FiUser className="login-input-icon" aria-hidden="true" />
            <input
              type="email"
              id="email"
              name="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="Ange ditt användarnamn"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-describedby={error ? "login-error" : undefined}
              required
            />
          </div>
        </div>

        <div className="login-field">
          <label htmlFor="password">Lösenord</label>
          <div className="login-input-wrap">
            <FiLock className="login-input-icon" aria-hidden="true" />
            <input
              type={showPassword ? "text" : "password"}
              id="password"
              name="password"
              autoComplete="current-password"
              placeholder="Ange ditt lösenord"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-describedby={error ? "login-error" : undefined}
              required
            />
            <button
              type="button"
              className="login-password-toggle"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Dölj lösenord" : "Visa lösenord"}
              aria-pressed={showPassword}
              aria-controls="password"
              title={showPassword ? "Dölj lösenord" : "Visa lösenord"}
            >
              {showPassword ? <FiEyeOff aria-hidden="true" /> : <FiEye aria-hidden="true" />}
            </button>
          </div>
        </div>

        <div className="login-options">
          <label className="login-remember">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
              aria-describedby="login-remember-info"
            />
            <span>Kom ihåg mig</span>
          </label>
          <Link to="/forgot-password" className="login-forgot">
            Glömt lösenord?
          </Link>
        </div>

        <button type="submit" className="login-submit" disabled={isSubmitting}>
          <span>{isSubmitting ? "Loggar in…" : "Logga in"}</span>
          <FiArrowRight aria-hidden="true" />
        </button>

        <div className="login-divider"><span>Eller logga in med</span></div>
        <button
          type="button"
          className="login-seb-id"
          disabled={isSubmitting}
          onClick={() => setSebIdPending(true)}
        >
          SEB ID
        </button>
        {sebIdPending && (
          <AuthFeedback
            kind="info"
            message="SEB ID är ännu inte anslutet. Logga in med e-post och lösenord."
          />
        )}
        <p className="login-note" id="login-remember-info">
          Kom ihåg mig ändrar inte inloggningstiden ännu.
        </p>
        {isSubmitting && (
          <div className="login-visually-hidden">
            <AuthFeedback kind="loading" message="Loggar in…" />
          </div>
        )}
      </form>
    </LoginLayout>
  );
}

export default Login;
