import { getRouteApi } from '@tanstack/react-router';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { LuFileSpreadsheet, LuScrollText, LuShieldCheck } from 'react-icons/lu';
import { z } from 'zod';
import { ApiError, getErrorMessage } from '../../api/client';
import logo from '../../assets/seb_logo_white.png';
import { useAuth } from '../../auth/AuthContext';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Input, PasswordInput } from '../../components/ui/Field';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { safeRedirect } from '../../routes/searchSchemas';
import { ROLE_LABELS } from '../../utils/labels';
import { focusFirstError, validateForm, type FieldErrors } from '../../utils/validation';
import { DEMO_PASSWORD, DEMO_USERS } from './demoUsers';
import '../../styles/pages/login.css';

const routeApi = getRouteApi('/login');

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Ange din e-postadress.')
    .pipe(z.email('Ange en giltig e-postadress, till exempel namn@foretag.se.')),
  password: z.string().min(1, 'Ange ditt lösenord.'),
});

type LoginValues = { email: string; password: string };

const RATE_LIMIT_COOLDOWN_SECONDS = 30;

const BENEFITS = [
  {
    icon: LuShieldCheck,
    title: 'Attest med fyra ögon',
    text: 'Större betalningar godkänns av en eller två attestanter.',
  },
  {
    icon: LuFileSpreadsheet,
    title: 'Batchbetalningar',
    text: 'Ladda upp en CSV-fil och granska allt innan något skickas.',
  },
  {
    icon: LuScrollText,
    title: 'Full spårbarhet',
    text: 'Varje händelse sparas i en signerad granskningslogg.',
  },
];

export function LoginPage() {
  useDocumentTitle('Logga in');
  const { login } = useAuth();
  const navigate = routeApi.useNavigate();
  const search = routeApi.useSearch();

  const [values, setValues] = useState<LoginValues>({ email: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors<LoginValues>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<{ message: string; rateLimited: boolean } | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const submitRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timeout = window.setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timeout);
  }, [cooldown]);

  function update(field: keyof LoginValues, value: string) {
    const next = { ...values, [field]: value };
    setValues(next);
    // After the first attempt, errors follow the input as the user corrects it.
    if (submitted) setErrors(validateForm(loginSchema, next).errors);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || cooldown > 0) return;
    setSubmitted(true);

    const result = validateForm(loginSchema, values);
    setErrors(result.errors);
    if (!result.success) {
      focusFirstError(result.errors, 'login-');
      return;
    }

    setSubmitError(null);
    setSubmitting(true);
    try {
      await login(result.data);
      await navigate({ href: safeRedirect(search.redirect) ?? '/dashboard', replace: true });
    } catch (error) {
      const rateLimited = error instanceof ApiError && error.status === 429;
      setSubmitError({ message: getErrorMessage(error), rateLimited });
      if (rateLimited) setCooldown(RATE_LIMIT_COOLDOWN_SECONDS);
      setSubmitting(false);
    }
  }

  function fillDemoUser(email: string) {
    setValues({ email, password: DEMO_PASSWORD });
    setErrors({});
    setSubmitError(null);
    submitRef.current?.focus();
  }

  return (
    <div className="login">
      <aside className="login__brand">
        <img src={logo} alt="SEB" className="login__logo" width={92} height={40} />
        <div className="login__brand-content">
          <p className="login__headline">Företagsbetalningar</p>
          <p className="login__lead">Betala, attestera och följ upp företagets betalningar på ett ställe.</p>
          <ul className="login__benefits">
            {BENEFITS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="login__benefit">
                <span className="login__benefit-icon">
                  <Icon aria-hidden="true" />
                </span>
                <span>
                  <strong>{title}</strong>
                  <span>{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="login__main">
        <div className="login__card">
          <h1 className="login__title">Logga in</h1>
          <p className="login__subtitle">Logga in med din e-postadress och ditt lösenord.</p>

          {search.reason === 'expired' && !submitError && (
            <Alert tone="info" className="login__alert">
              Din session har gått ut. Logga in igen för att fortsätta.
            </Alert>
          )}
          {submitError && (
            <Alert
              tone={submitError.rateLimited ? 'warning' : 'danger'}
              className="login__alert"
              live
              title={submitError.rateLimited ? 'För många försök' : 'Inloggningen misslyckades'}
            >
              {submitError.message}
            </Alert>
          )}

          <form className="login__form" onSubmit={handleSubmit} noValidate>
            <Input
              id="login-email"
              label="E-postadress"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="namn@foretag.se"
              value={values.email}
              onChange={(event) => update('email', event.target.value)}
              error={errors.email}
              autoFocus
            />
            <PasswordInput
              id="login-password"
              label="Lösenord"
              autoComplete="current-password"
              value={values.password}
              onChange={(event) => update('password', event.target.value)}
              error={errors.password}
            />
            <Button ref={submitRef} type="submit" size="lg" block loading={submitting} disabled={cooldown > 0}>
              {cooldown > 0 ? `Försök igen om ${cooldown} s` : 'Logga in'}
            </Button>
          </form>

          {import.meta.env.DEV && (
            <div className="demo-users">
              <p className="demo-users__label">Demoanvändare</p>
              <div className="demo-users__chips">
                {DEMO_USERS.map((user) => (
                  <button
                    key={user.email}
                    type="button"
                    className="chip"
                    onClick={() => fillDemoUser(user.email)}
                    aria-label={`Fyll i ${user.name}, ${ROLE_LABELS[user.role].toLowerCase()}`}
                  >
                    <span className="chip__name">{user.name}</span>
                    <span className="chip__meta">{ROLE_LABELS[user.role]}</span>
                  </button>
                ))}
              </div>
              <p className="demo-users__hint">Visas bara i utvecklingsläge. Alla har lösenordet {DEMO_PASSWORD}.</p>
            </div>
          )}
        </div>
        <p className="login__help">Glömt lösenordet? Kontakta företagets administratör.</p>
      </main>
    </div>
  );
}
