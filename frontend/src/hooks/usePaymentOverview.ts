import { useEffect, useState } from "react";
import { getRecentPayments, PaymentReadError } from "../api/paymentsApi";
import type { PaymentOverview } from "../types/Payment";

type OverviewState = {
  data: PaymentOverview | null;
  isLoading: boolean;
  error: string | null;
  needsLogin: boolean;
};

const initialState: OverviewState = {
  data: null,
  isLoading: true,
  error: null,
  needsLogin: false,
};

export function usePaymentOverview() {
  const [state, setState] = useState<OverviewState>(initialState);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    getRecentPayments(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setState({ data, isLoading: false, error: null, needsLogin: false });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            data: null,
            isLoading: false,
            error: error instanceof TypeError
              ? "Kunde inte nå backend-API:t. Kontrollera anslutningen och försök igen."
              : error instanceof Error ? error.message : "Kunde inte hämta betalningarna.",
            needsLogin: error instanceof PaymentReadError && error.status === 401,
          });
        }
      });

    return () => controller.abort();
  }, [attempt]);

  function retry() {
    setState(initialState);
    setAttempt((current) => current + 1);
  }

  return { ...state, retry };
}
