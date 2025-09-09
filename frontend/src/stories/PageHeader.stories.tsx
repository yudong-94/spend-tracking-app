import type { Meta, StoryObj } from "@storybook/react";
import PageHeader from "@/components/PageHeader";

const meta: Meta<typeof PageHeader> = {
  title: "Components/PageHeader",
  component: PageHeader,
};
export default meta;
type Story = StoryObj<typeof PageHeader>;

export const Default: Story = {
  args: {
    lastUpdated: Date.now(),
    isRefreshing: false,
  },
};

export const Refreshing: Story = {
  args: {
    lastUpdated: Date.now(),
    isRefreshing: true,
  },
};
