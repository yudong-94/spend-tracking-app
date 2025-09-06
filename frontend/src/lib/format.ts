export const fmtUSD = (n: number, decimals = 0) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals,
    }).format(Number.isFinite(n) ? n : 0);

export const fmtUSDSigned = (
    n: number,
    kind: "income" | "expense",
    decimals = 2
    ) =>
    new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        signDisplay: "always",           // + / -
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(kind === "income" ? n : -n);