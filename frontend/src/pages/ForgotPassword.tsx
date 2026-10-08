import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { FiArrowLeft, FiArrowRight, FiMail } from "react-icons/fi";
import AuthFeedback from "../components/auth/AuthFeedback";
import LoginLayout from "../components/auth/LoginLayout";

export default function ForgotPassword() {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [email, setEmail] = useState("");
  const [submissionBlocked, setSubmissionBlocked] = useState(false);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // No recovery contract exists yet. Never send credentials to a guessed endpoint.
    setSubmissionBlocked(true);
  }

  return (
    <LoginLayout labelledBy="recovery-title">
      <h1 id="recovery-title" ref={headingRef} tabIndex={-1}>Glömt lösenord?</h1>
      <p className="login-intro">Ange e-postadressen som hör till ditt konto.</p>

      <form className="login-form" onSubmit={handleSubmit} aria-describedby="recovery-info">
        <p className="login-recovery-info" id="recovery-info">
          Återställningstjänsten är ännu inte ansluten. Du kan kontrollera din
          e-postadress här, men ingen återställningsbegäran kan skickas ännu.
        </p>

        {submissionBlocked && (
          <AuthFeedback
            kind="error"
            id="recovery-error"
            message="Begäran kan inte skickas eftersom återställningstjänsten inte är ansluten. Ingen e-post har skickats."
          />
        )}

        <div className="login-field">
          <label htmlFor="recovery-email">E-post</label>
          <div className="login-input-wrap">
            <FiMail className="login-input-icon" aria-hidden="true" />
            <input
              type="email"
              id="recovery-email"
              name="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="Ange din e-postadress"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setSubmissionBlocked(false);
              }}
              aria-describedby={submissionBlocked ? "recovery-info recovery-error" : "recovery-info"}
              required
            />
          </div>
        </div>

        <button type="submit" className="login-submit login-recovery-submit">
          <span>Fortsätt</span><FiArrowRight aria-hidden="true" />
        </button>
      </form>

      <Link to="/" className="login-back-link">
        <FiArrowLeft aria-hidden="true" />Tillbaka till inloggning
      </Link>
    </LoginLayout>
  );
}
