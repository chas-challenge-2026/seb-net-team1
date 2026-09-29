import logo from '../../assets/seb_logo_white.png';
import { Spinner } from '../ui/Spinner';

/** Full-page branded screen shown while the session is restored on app start. */
export function SplashScreen() {
  return (
    <div className="splash" role="status" aria-live="polite">
      <img src={logo} alt="SEB" className="splash__logo" width={110} height={48} />
      <p className="splash__title">Företagsbetalningar</p>
      <Spinner size="md" className="splash__spinner" />
      <span className="visually-hidden">Laddar, ett ögonblick…</span>
    </div>
  );
}
