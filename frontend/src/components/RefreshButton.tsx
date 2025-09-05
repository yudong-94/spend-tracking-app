import { useDataCache } from "@/state/data-cache";

export default function RefreshButton() {
  const { refresh, isLoading, lastSyncAt } = useDataCache();
  return (
    <div className="ml-auto flex items-center gap-3">
      {lastSyncAt && (
        <span className="text-xs text-slate-500">
          Updated {new Date(lastSyncAt).toLocaleTimeString()}
        </span>
      )}
      <button
        onClick={refresh}
        disabled={isLoading}
        className="px-3 py-1.5 text-sm rounded border bg-white hover:bg-slate-50 disabled:opacity-50"
        title="Refresh data from Google Sheets"
      >
        {isLoading ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  );
}