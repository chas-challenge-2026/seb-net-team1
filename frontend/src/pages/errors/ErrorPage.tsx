import { Link, useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { LuArrowLeft, LuRefreshCw, LuTriangleAlert } from 'react-icons/lu';
import { getErrorMessage } from '../../api/client';
import { Button } from '../../components/ui/Button';
import { buttonClass } from '../../components/ui/buttonClass';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

/** Error boundary view for anything that throws while rendering a route. */
export function ErrorPage({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  useDocumentTitle('Något gick fel');

  return (
    <div className="status-page" role="alert">
      <span className="status-page__icon tone-danger">
        <LuTriangleAlert aria-hidden="true" />
      </span>
      <h1 className="status-page__title">Något gick fel</h1>
      <p className="status-page__text">
        {getErrorMessage(error, 'Sidan kunde inte visas på grund av ett oväntat fel. Försök igen om en stund.')}
      </p>
      {import.meta.env.DEV && error instanceof Error && <pre className="status-page__details">{error.message}</pre>}
      <div className="status-page__actions">
        <Button
          variant="secondary"
          icon={LuRefreshCw}
          onClick={() => {
            reset();
            void router.invalidate();
          }}
        >
          Försök igen
        </Button>
        <Link to="/dashboard" className={buttonClass()}>
          <LuArrowLeft aria-hidden="true" />
          Till översikten
        </Link>
      </div>
    </div>
  );
}
