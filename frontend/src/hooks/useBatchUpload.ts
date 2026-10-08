import { useEffect, useRef, useState } from "react";
import { BATCH_MAX_FILE_SIZE_BYTES, validateBatchCsv } from "../utils/batchCsv";
import type { BatchValidationResult } from "../types/BatchFile";

type UploadState = {
  phase: "empty" | "reading" | "ready" | "error";
  name: string;
  size: number;
  revision: number;
  result: BatchValidationResult | null;
  error: string | null;
};
const EMPTY_UPLOAD: UploadState = { phase: "empty", name: "", size: 0, revision: 0, result: null, error: null };

export function useBatchUpload() {
  const [upload, setUpload] = useState(EMPTY_UPLOAD);
  const generation = useRef(0);
  useEffect(() => () => { generation.current += 1; }, []);

  function reset() {
    generation.current += 1;
    setUpload({ ...EMPTY_UPLOAD, revision: generation.current });
  }
  async function selectFile(file: File) {
    const revision = ++generation.current;
    const base = { name: file.name, size: file.size, revision, result: null };
    const error = !file.name.toLowerCase().endsWith(".csv") ? "Välj en CSV-fil med filändelsen .csv."
      : file.size === 0 ? "CSV-filen är tom."
      : file.size > BATCH_MAX_FILE_SIZE_BYTES ? "CSV-filen får vara högst 1 MB." : null;
    if (error) { setUpload({ ...base, phase: "error", error }); return; }
    setUpload({ ...base, phase: "reading", error: null });
    try {
      const content = await file.text();
      if (generation.current !== revision) return;
      setUpload({ ...base, phase: "ready", error: null, result: validateBatchCsv(content) });
    } catch {
      if (generation.current !== revision) return;
      setUpload({ ...base, phase: "error", error: "Kunde inte läsa CSV-filen. Försök med en annan fil." });
    }
  }
  return { upload, selectFile, reset };
}
