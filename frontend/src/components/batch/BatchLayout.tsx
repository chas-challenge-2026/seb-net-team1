import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { LuFlaskConical, LuSearch } from "react-icons/lu";
import Sidebar from "../dashboard/Sidebar";
import DashboardHeader from "../dashboard/DashboardHeader";
import { useBatchUpload } from "../../hooks/useBatchUpload";
import { createBatchHistorySource } from "../../data/batchHistorySource";
import { DEFAULT_BATCH_QUERY } from "../../utils/batchHistory";
import "../../styles/dashboard.css";
import "../../styles/batchFiles.css";

export default function BatchLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [query, setQuery] = useState(DEFAULT_BATCH_QUERY);
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const isOverview = pathname === "/batch-files" || pathname === "/batch-files/";
  const isUpload = pathname === "/batch-upload" || pathname === "/batch-upload/";
  const navigate = useNavigate();
  const preview = params.get("preview");
  const pagination = params.get("pagination");
  const scenario = params.get("scenario");
  const source = useMemo(() => createBatchHistorySource(preview, pagination, scenario), [preview, pagination, scenario]);
  const upload = useBatchUpload();
  const main = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const isUploadActive = isUpload && upload.upload.phase !== "empty";
  useLayoutEffect(() => {
    if (isUpload) {
      content.current?.scrollTo({ top: 0 });
      main.current?.scrollTo({ top: 0 });
    }
  }, [isUpload, upload.upload.phase, upload.upload.revision]);
  const previewQuery = source.kind === "development"
    ? `?${new URLSearchParams({ preview: "fixtures", ...(pagination ? { pagination } : {}), ...(scenario ? { scenario } : {}) })}` : "";

  return <div className={`dashboard-layout batch-files-layout${isOverview ? " batch-files-layout--overview" : ""}${isUpload ? " batch-files-layout--upload" : ""}${isUploadActive ? " batch-files-layout--upload-active" : ""}`}>
    <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen((open) => !open)} onClose={() => setSidebarOpen(false)} />
    <button type="button" className={`sidebar-overlay${sidebarOpen ? " is-open" : ""}`}
      onClick={() => setSidebarOpen(false)} aria-label="Stäng meny" />
    <main ref={main} className="dashboard-main batch-files-main">
      <div className="batch-files-header">
        <DashboardHeader title="Batchfiler"
          subtitle={isOverview ? "Manage and monitor your batch files. Ladda upp, validera och spåra status för alla dina finansiella överföringsfiler." : ""}
          showSearch={false} />
        <label className="batch-files-header-search batch-files-search"><LuSearch aria-hidden="true" />
          <span className="batch-files-sr-only">Sök i batchfilhistoriken</span>
          <input type="search" placeholder="Sök batchfiler…" value={query.search}
            onChange={(event) => {
              setQuery((previous) => ({ ...previous, search: event.target.value }));
              if (pathname !== "/batch-files") navigate(`/batch-files${previewQuery}`);
            }} /></label>
      </div>
      <div ref={content} className="dashboard-content batch-files-content">
        {source.kind === "development" && <aside className="batch-files-development" aria-label="Utvecklingsläge">
          <LuFlaskConical aria-hidden="true" />
          <div><strong>Utvecklingsdata</strong><span> Isolerade exempel, inga verkliga batchfiler eller backendanrop.
            {source.pagination === "cursor" ? " Lokala testcursors." : " Klientbaserad paginering."}</span></div>
          <Link to="/batch-files">Avsluta förhandsvisning</Link>
        </aside>}
        <Outlet key={`${preview}:${pagination}:${scenario}`} context={{ ...upload, source, previewQuery, query, setQuery }} />
      </div>
    </main>
  </div>;
}
