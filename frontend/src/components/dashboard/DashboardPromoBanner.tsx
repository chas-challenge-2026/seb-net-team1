export default function DashboardPromoBanner() {
  return (
    <aside
      className="dashboard-promo-banner"
      aria-labelledby="dashboard-promo-title"
    >
      <div className="dashboard-promo-banner__copy">
        <h2 id="dashboard-promo-title">
          Säkra och effektiva företagsbetalningar
        </h2>
        <p>
          Få full kontroll över ditt företags ekonomi – tryggt, enkelt och i
          realtid.
        </p>
      </div>

      <a
        className="dashboard-promo-banner__button"
        href="https://seb.se/juridik-och-sakerhet"
        target="_blank"
        rel="noreferrer"
      >
        Läs mer <span aria-hidden="true">→</span>
      </a>
    </aside>
  );
}