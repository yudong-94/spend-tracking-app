import { fmtUSD } from "@/lib/format";
import { COL } from "@/lib/colors";
import { estimateYAxisWidthFromMax } from "@/lib/chart";
import {
  ResponsiveContainer,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Bar,
  Line,
} from "recharts";
export type MonthlyPoint = { month: string; income: number; expense: number; net: number };
type SimpleTooltipFormatter = (
  value: number | string,
  name: string,
  payload: unknown,
  index: number,
) => string;

const formatTooltip: SimpleTooltipFormatter = (value) =>
  fmtUSD(typeof value === "number" ? value : Number(value));

export default function CombinedMonthlyChart({ data }: { data: MonthlyPoint[] }) {
  const yWidth = Math.max(
    56,
    estimateYAxisWidthFromMax(
      Math.max(
        0,
        ...data.map((p) => p.income || 0),
        ...data.map((p) => p.expense || 0),
        ...data.map((p) => Math.abs(p.net || 0)),
      ),
      fmtUSD,
    ),
  );

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 16, right: 8, top: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis width={yWidth} tickFormatter={(v: number) => fmtUSD(v)} />
          <Tooltip formatter={formatTooltip} />
          <Legend />
          <Bar dataKey="income" name="Income" fill={COL.income} radius={[4, 4, 0, 0]} />
          <Bar dataKey="expense" name="Expense" fill={COL.expense} radius={[4, 4, 0, 0]} />
          <Line type="monotone" dataKey="net" name="Net" stroke={COL.net} dot={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
