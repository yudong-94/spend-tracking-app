type Props = {
  onClick: () => void | Promise<void>;
  label?: string;
  className?: string;
  disabled?: boolean;
};

export default function RefreshButton({
  onClick,
  label = "Refresh",
  className = "",
  disabled,
}: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 rounded border text-sm bg-white hover:bg-slate-50 disabled:opacity-50 ${className}`}
    >
      {label}
    </button>
  );
}