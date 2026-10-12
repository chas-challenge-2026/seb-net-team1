import { useOutletContext } from "react-router-dom";
import type { Dispatch, SetStateAction } from "react";
import type { BatchHistoryQuery, BatchHistorySource } from "../types/BatchFile";
import type { useBatchUpload } from "./useBatchUpload";

export function useBatchWorkspace() {
  return useOutletContext<ReturnType<typeof useBatchUpload> & {
    source: BatchHistorySource;
    previewQuery: string;
    query: BatchHistoryQuery;
    setQuery: Dispatch<SetStateAction<BatchHistoryQuery>>;
  }>();
}
