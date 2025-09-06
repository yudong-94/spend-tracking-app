import { useAuth } from "@/state/auth";

export default function AccessGate({ children }: { children: React.ReactNode }) {
  const { token, setToken } = useAuth();
  if (token) return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <form
        className="w-full max-w-sm border rounded-lg p-4 shadow bg-white"
        onSubmit={(e) => {
          e.preventDefault();
          const v = new FormData(e.currentTarget).get("key") as string;
          if (v?.trim()) setToken(v.trim());
        }}
      >
        <h1 className="text-lg font-semibold mb-3">Enter access key</h1>
        <input
          name="key"
          type="password"
          autoFocus
          placeholder="Access key"
          className="w-full border rounded px-3 py-2 mb-3"
        />
        <button className="w-full bg-slate-900 text-white rounded px-3 py-2">Continue</button>
        <p className="mt-2 text-sm text-slate-500">Tip: this must match APP_ACCESS_TOKEN on the server.</p>
      </form>
    </div>
  );
}