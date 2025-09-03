import { useEffect, useState } from "react";
import { listTransactions } from "@/lib/api";

type Point = { month: string; income: number; expense: number; net: number };

export default function Trends() {
  const [series, setSeries] = useState<Point[]>([]);

  useEffect(() => {
    const start = "2024-01-01"; const end = "2025-12-31"; // replace with your UI filter
    listTransactions({ start, end }).then((rows) => {
      const byMonth = new Map<string, Point>();
      for (const r of rows) {
        const m = (r.Date || r.date).slice(0, 7); // YYYY-MM
        const p = byMonth.get(m) || { month: m, income: 0, expense: 0, net: 0 };
        const amt = Number(r.Amount ?? 0) || 0;
        const type = String(r.Type ?? "").toLowerCase();
        if (type === "income") p.income += amt; else if (type === "expense") p.expense += amt;
        p.net = p.income - p.expense;
        byMonth.set(m, p);
      }
      setSeries([...byMonth.values()].sort((a,b)=>a.month.localeCompare(b.month)));
    });
  }, []);

  // feed `series` to your Chart.js/Recharts line chart
  return <div>{/* chart */}</div>;
}