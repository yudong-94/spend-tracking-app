import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { MonthlySummary } from '@spend-tracking/shared';
import { formatCurrency, formatMonth } from '@spend-tracking/shared';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface MonthlyChartsProps {
  monthlyTrends: MonthlySummary[];
  categoryFilter?: string; // Add this prop
}

const MonthlyCharts: React.FC<MonthlyChartsProps> = ({ monthlyTrends, categoryFilter }) => {
    // Reverse the order for charts to show earliest to latest (left to right)
    const chartData = [...monthlyTrends].reverse();
    const labels = chartData.map(month => formatMonth(month.month));
    
    const incomeData = chartData.map(month => month.income);
    const expensesData = chartData.map(month => Math.abs(month.expenses)); // Use absolute value for display
    const netData = chartData.map(month => month.netCashFlow);
  
  const incomeChartData = {
    labels,
    datasets: [
      {
        label: 'Monthly Income',
        data: incomeData,
        backgroundColor: 'rgba(34, 197, 94, 0.8)',
        borderColor: 'rgb(34, 197, 94)',
        borderWidth: 1,
      },
    ],
  };

  const expensesChartData = {
    labels,
    datasets: [
      {
        label: 'Monthly Expenses',
        data: expensesData,
        backgroundColor: 'rgba(239, 68, 68, 0.8)',
        borderColor: 'rgb(239, 68, 68)',
        borderWidth: 1,
      },
    ],
  };

  const netChartData = {
    labels,
    datasets: [
      {
        label: 'Monthly Net Cash Flow',
        data: netData,
        backgroundColor: netData.map(value => 
          value >= 0 ? 'rgba(34, 197, 94, 0.8)' : 'rgba(239, 68, 68, 0.8)'
        ),
        borderColor: netData.map(value => 
          value >= 0 ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'
        ),
        borderWidth: 1,
      },
    ],
  };


  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: categoryFilter 
          ? `Monthly Financial Trends - ${categoryFilter}`
          : 'Monthly Financial Trends',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value: any) {
            return formatCurrency(value);
          },
        },
      },
    },
  };

  return (
    <div className="space-y-6">
      {/* Income Chart */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-medium text-gray-900">Monthly Income Trend</h3>
        </div>
        <div className="card-body">
          <Bar data={incomeChartData} options={chartOptions} />
        </div>
      </div>

      {/* Expenses Chart */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-medium text-gray-900">Monthly Expenses Trend</h3>
        </div>
        <div className="card-body">
          <Bar data={expensesChartData} options={chartOptions} />
        </div>
      </div>

      {/* Net Cash Flow Chart */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-medium text-gray-900">Monthly Net Cash Flow Trend</h3>
        </div>
        <div className="card-body">
          <Bar data={netChartData} options={chartOptions} />
        </div>
      </div>
    </div>
  );
};

export default MonthlyCharts;