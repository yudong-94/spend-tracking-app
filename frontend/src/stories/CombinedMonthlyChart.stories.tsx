import type { Meta, StoryObj } from "@storybook/react";
import CombinedMonthlyChart, { MonthlyPoint } from "@/components/CombinedMonthlyChart";

const meta: Meta<typeof CombinedMonthlyChart> = {
  title: "Charts/CombinedMonthlyChart",
  component: CombinedMonthlyChart,
};
export default meta;
type Story = StoryObj<typeof CombinedMonthlyChart>;

const sample: MonthlyPoint[] = [
  { month: "2025-01", income: 9000, expense: 6500, net: 2500 },
  { month: "2025-02", income: 9100, expense: 7000, net: 2100 },
  { month: "2025-03", income: 9050, expense: 6400, net: 2650 },
  { month: "2025-04", income: 9200, expense: 6800, net: 2400 },
  { month: "2025-05", income: 9150, expense: 7100, net: 2050 },
];

export const Basic: Story = {
  args: {
    data: sample,
  },
};
