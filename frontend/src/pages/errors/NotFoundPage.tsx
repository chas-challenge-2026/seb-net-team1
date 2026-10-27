import { Link } from '@tanstack/react-router';
import { LuArrowLeft, LuCompass } from 'react-icons/lu';
import { buttonClass } from '../../components/ui/buttonClass';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

export function NotFoundPage() {
  useDocumentTitle('Sidan hittades inte');
  return (
    <div className="status-page">
      <span className="status-page__icon tone-neutral">
        <LuCompass aria-hidden="true" />
      </span>
      <p className="status-page__code">404</p>
      <h1 className="status-page__title">Sidan hittades inte</h1>
      <p className="status-page__text">
        Adressen finns inte eller har flyttats. Kontrollera länken eller gå tillbaka till översikten.
      </p>
      <Link to="/dashboard" className={buttonClass()}>
        <LuArrowLeft aria-hidden="true" />
        Till översikten
      </Link>
    </div>
  );
}
