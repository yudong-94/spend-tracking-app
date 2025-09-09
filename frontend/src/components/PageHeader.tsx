import React from "react";
import RefreshButton from "@/components/RefreshButton";

export default function PageHeader({
  lastUpdated,
  onRefresh,
  isRefreshing,
  className,
  children,
}: {
  lastUpdated?: number | null;
  onRefresh?: () => Promise<void> | void;
  isRefreshing?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`flex items-center ${className || ""}`}>
      {children}
      <div className="ml-auto flex items-center gap-3">
        {lastUpdated ? (
          <span className="text-xs text-slate-500">
            Updated {new Date(lastUpdated).toLocaleTimeString()}
          </span>
        ) : null}
        {onRefresh ? (
          <RefreshButton
            onClick={onRefresh}
            disabled={!!isRefreshing}
            label={isRefreshing ? "Refreshing..." : "Refresh"}
          />
        ) : null}
      </div>
    </div>
  );
}
