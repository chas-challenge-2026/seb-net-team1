import { useEffect, useRef, useState } from "react";
import type { BatchHistoryPage, BatchHistoryQuery, BatchHistorySource } from "../types/BatchFile";
import { BatchHistoryUnavailable } from "../data/batchHistorySource";
import { commitBatchCursor } from "../utils/batchPagination";
import type { BatchCursorHistory } from "../utils/batchPagination";

type HistoryState = {
  key: string; data: BatchHistoryPage | null; error: string | null;
  unavailable: boolean; loading: boolean; navigation: BatchCursorHistory;
  failedPage: number | null;
};
const INITIAL_NAVIGATION: BatchCursorHistory = { cursors: [undefined], index: 0 };

export function useBatchHistory(source: BatchHistorySource, query: BatchHistoryQuery) {
  const key = JSON.stringify(query);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<HistoryState>({ key: "", data: null, error: null,
    unavailable: false, loading: true, navigation: INITIAL_NAVIGATION, failedPage: null });
  const active = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    active.current?.abort();
    active.current = controller;
    source.list(query, undefined, controller.signal).then((data) => {
      if (!controller.signal.aborted) setState({ key, data, error: null, unavailable: false,
        loading: false, navigation: INITIAL_NAVIGATION, failedPage: null });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState({ key, data: null,
        error: error instanceof Error ? error.message : "Kunde inte hämta filhistoriken.",
        unavailable: error instanceof BatchHistoryUnavailable, loading: false, navigation: INITIAL_NAVIGATION, failedPage: null });
    });
    return () => { controller.abort(); active.current?.abort(); };
  }, [source, query, key, retry]);

  async function goToCursor(index: number) {
    if (state.key !== key || state.loading || !state.data || index < 0 || index === state.navigation.index) return;
    const isNext = index === state.navigation.index + 1;
    const cursor = isNext ? state.data.nextCursor : state.navigation.cursors[index];
    if (isNext && cursor === null) return;
    if (!isNext && index >= state.navigation.cursors.length) return;
    const controller = new AbortController();
    active.current?.abort();
    active.current = controller;
    setState((previous) => ({ ...previous, loading: true, error: null, failedPage: null }));
    try {
      const data = await source.list(query, cursor ?? undefined, controller.signal);
      if (!controller.signal.aborted) setState((previous) => ({ ...previous, data, loading: false,
        navigation: commitBatchCursor(previous.navigation, index, cursor ?? undefined, data.nextCursor) }));
    } catch (error) {
      if (!controller.signal.aborted) setState((previous) => ({ ...previous, loading: false,
        error: error instanceof Error ? error.message : "Kunde inte hämta nästa sida.", failedPage: index }));
    }
  }
  return { ...state, data: state.key === key ? state.data : null, metadata: state.data,
    navigation: state.key === key ? state.navigation : INITIAL_NAVIGATION,
    error: state.key === key ? state.error : null,
    loading: state.key !== key || state.loading, goToCursor,
    reload: () => { active.current?.abort(); setState((previous) => ({ ...previous, loading: true, error: null })); setRetry((value) => value + 1); } };
}
