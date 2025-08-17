import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { formatCurrency, formatMonth} from '@spend-tracking/shared';
import { apiService } from '../services/api';
import { getDefaultPeriodFilter } from '@spend-tracking/shared';
import { Calendar, TrendingUp, PieChart, Filter } from 'lucide-react';
import MonthlyCharts from '../components/MonthlyCharts';


const Analytics: React.FC = () => {
  const [periodFilter, setPeriodFilter] = useState(getDefaultPeriodFilter());

  const clearFilters = () => {
    setPeriodFilter(getDefaultPeriodFilter());
  };

  const { data: analyticsData, isLoading, error } = useQuery(
    ['analytics', periodFilter],
    () => apiService.getAnalytics(periodFilter),
    {
      refetchInterval: 300000, // Refetch every 5 minutes
    }
  );


  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-64 bg-gray-200 rounded"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-danger-600 text-lg font-medium mb-2">
          Failed to load analytics data
        </div>
        <button
          onClick={() => window.location.reload()}
          className="btn-primary"
        >
          Retry
        </button>
      </div>
    );
  }

  const data = analyticsData?.data;
  if (!data) return null;

  const { monthlyTrends, categoryBreakdown, totalIncome, totalExpenses, netCashFlow } = data;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-gray-600">Insights into your spending patterns and trends</p>
      </div>

      {/* Period and Category Filter */}
      <div className="card">
        <div className="card-body">
          <div className="flex flex-col lg:flex-row lg:items-center space-y-4 lg:space-y-0 lg:space-x-6">
            {/* Period Filter */}
            <div className="flex items-center space-x-4">
              <Calendar className="h-5 w-5 text-gray-400" />
              <label htmlFor="start-date" className="text-sm font-medium text-gray-700">
                Period:
              </label>
              <input
                type="date"
                id="start-date"
                value={periodFilter.startDate}
                onChange={(e) => setPeriodFilter(prev => ({ ...prev, startDate: e.target.value }))}
                className="input"
              />
              <span className="text-gray-500">to</span>
              <input
                type="date"
                id="end-date"
                value={periodFilter.endDate}
                onChange={(e) => setPeriodFilter(prev => ({ ...prev, endDate: e.target.value }))}
                className="input"
              />
            </div>

            {/* Category Filter */}
            <div className="flex items-center space-x-4">
              <Filter className="h-5 w-5 text-gray-400" />
              <label htmlFor="category-filter" className="text-sm font-medium text-gray-700">
                Category:
              </label>
              <select
                id="category-filter"
                value={periodFilter.category || ''}
                onChange={(e) => setPeriodFilter(prev => ({ 
                  ...prev, 
                  category: e.target.value || undefined 
                }))}
                className="input"
              >
                <option value="">All Categories</option>
                {categoryBreakdown?.map((category) => (
                  <option key={category.category} value={category.category}>
                    {category.category}
                  </option>
                ))}
              </select>
              <button
                onClick={clearFilters}
                className="btn-secondary text-sm px-3 py-2"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <div className="card">
          <div className="card-body text-center">
            <div className="w-12 h-12 bg-success-100 rounded-lg flex items-center justify-center mx-auto mb-3">
              <TrendingUp className="h-6 w-6 text-success-600" />
            </div>
            <p className="text-sm font-medium text-gray-600">Total Income</p>
            <p className="text-2xl font-bold text-success-600">{formatCurrency(totalIncome)}</p>
          </div>
        </div>

        <div className="card">
          <div className="card-body text-center">
            <div className="w-12 h-12 bg-danger-100 rounded-lg flex items-center justify-center mx-auto mb-3">
              <TrendingUp className="h-6 w-6 text-danger-600 transform rotate-180" />
            </div>
            <p className="text-sm font-medium text-gray-600">Total Expenses</p>
            <p className="text-2xl font-bold text-danger-600">{formatCurrency(totalExpenses)}</p>
          </div>
        </div>

        <div className="card">
          <div className="card-body text-center">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-3 ${
              netCashFlow >= 0 ? 'bg-success-100' : 'bg-danger-100'
            }`}>
              <TrendingUp className={`h-6 w-6 ${
                netCashFlow >= 0 ? 'text-success-600' : 'text-danger-600'
              }`} />
            </div>
            <p className="text-sm font-medium text-gray-600">Net Cash Flow</p>
            <p className={`text-2xl font-bold ${
              netCashFlow >= 0 ? 'text-success-600' : 'text-danger-600'
            }`}>
              {formatCurrency(Math.abs(netCashFlow))}
            </p>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Category Breakdown */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-medium text-gray-900 flex items-center">
              <PieChart className="h-5 w-5 mr-2" />
              Category Breakdown
            </h3>
          </div>
          <div className="card-body">
            {categoryBreakdown && categoryBreakdown.length > 0 ? (
              <div className="space-y-4">
                {categoryBreakdown.slice(0, 8).map((category, index) => (
                  <div key={category.category} className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div 
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: `hsl(${(index * 45) % 360}, 70%, 60%)` }}
                      />
                      <span className="font-medium text-gray-900">{category.category}</span>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-gray-900">{formatCurrency(category.amount)}</p>
                      <p className="text-sm text-gray-500">{category.percentage.toFixed(1)}%</p>
                    </div>
                  </div>
                ))}
                {categoryBreakdown.length > 8 && (
                  <div className="pt-3 border-t border-gray-100 text-center text-sm text-gray-500">
                    +{categoryBreakdown.length - 8} more categories
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                No category data available for the selected period
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Insights */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-medium text-gray-900">Key Insights</h3>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-gray-900 mb-3">Top Spending Categories</h4>
              {categoryBreakdown && categoryBreakdown.length > 0 ? (
                <ul className="space-y-2">
                  {categoryBreakdown.slice(0, 3).map((category, index) => (
                    <li key={category.category} className="flex justify-between text-sm">
                      <span className="text-gray-600">{index + 1}. {category.category}</span>
                      <span className="font-medium">{formatCurrency(category.amount)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500">No data available</p>
              )}
            </div>
            
            <div>
              <h4 className="font-medium text-gray-900 mb-3">Financial Health</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Savings Rate:</span>
                  <span className={`font-medium ${
                    totalIncome > 0 ? 'text-success-600' : 'text-gray-500'
                  }`}>
                    {totalIncome > 0 ? ((netCashFlow / totalIncome) * 100).toFixed(1) : '0'}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Expense Ratio:</span>
                  <span className="font-medium text-gray-900">
                    {totalIncome > 0 ? ((totalExpenses / totalIncome) * 100).toFixed(1) : '0'}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Status:</span>
                  <span className={`font-medium ${
                    netCashFlow >= 0 ? 'text-success-600' : 'text-danger-600'
                  }`}>
                    {netCashFlow >= 0 ? 'Positive' : 'Negative'} Cash Flow
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

        {/* Monthly Charts */}
        <MonthlyCharts 
          monthlyTrends={monthlyTrends} 
          categoryFilter={periodFilter.category}
        />

        {/* Monthly Trends */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-medium text-gray-900 flex items-center">
              <TrendingUp className="h-5 w-5 mr-2" />
              Monthly Trends
            </h3>
          </div>
          <div className="card-body">
            {monthlyTrends && monthlyTrends.length > 0 ? (
              <div className="space-y-4">
                {monthlyTrends.map((month) => (
                  <div key={month.month} className="border-b border-gray-100 pb-3 last:border-b-0">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium text-gray-900">{formatMonth(month.month)}</span>
                      <span className="text-sm text-gray-500">{month.transactionCount} transactions</span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-success-600 font-medium">+{formatCurrency(month.income)}</span>
                        <p className="text-gray-500">Income</p>
                      </div>
                      <div>
                        <span className="text-danger-600 font-medium">-{formatCurrency(month.expenses)}</span>
                        <p className="text-gray-500">Expenses</p>
                      </div>
                      <div>
                        <span className={`font-medium ${
                          month.netCashFlow >= 0 ? 'text-success-600' : 'text-danger-600'
                        }`}>
                          {month.netCashFlow >= 0 ? '+' : '-'}{formatCurrency(Math.abs(month.netCashFlow))}
                        </span>
                        <p className="text-gray-500">Net</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                No monthly data available for the selected period
              </div>
            )}
          </div>
        </div>
      
    </div>
  );
};

export default Analytics;
