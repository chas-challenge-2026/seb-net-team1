import { useEffect } from 'react';

const APP_NAME = 'SEB Företagsbetalningar';

/** Sets the browser tab title: "Betalningar · SEB Företagsbetalningar". */
export function useDocumentTitle(title: string | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
  }, [title]);
}
