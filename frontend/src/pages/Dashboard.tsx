import React from 'react';
import { useQuery } from 'react-query';
import { Link } from 'react-router-dom';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Plus,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { apiService } from '../services/api';
import { formatCurrency, formatDate, getDefaultPeriodFilter } from '@spend-tracking/shared';
 

const monthBounds = (d = new Date()) => {
  const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0,10);
  const end = new Date(d.getFullYear(), d.getMonth()+1, 0).toISOString().slice(0,10);
  return { start, end };
};



const Dashboard: React.FC = () => {
  const defaultPeriod = getDefaultPeriodFilter();
  
  const { data: analyticsData, isLoading, error } = useQuery(
    ['dashboard-analytics', defaultPeriod],
    () => apiService.getAnalytics(defaultPeriod),
    {
      refetchInterval: 300000, // Refetch every 5 minutes
    }
  );

  const { data: recentTransactions } = useQuery(
    ['recent-transactions'],
    () => apiService.getTransactions(),
    {
      select: (data) => {
        if (data.success && data.data) {
          return data.data
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 5);
        }
        return [];
      },
    }
  );

  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card">
              <div className="card-body">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-danger-600 text-lg font-medium mb-2">
          Failed to load dashboard data
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

  const { totalIncome, totalExpenses, netCashFlow } = data;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">Overview of your financial status</p>
        </div>
        <Link to="/add" className="btn-primary">
          <Plus className="h-4 w-4 mr-2" />
          Add Transaction
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Income */}
        <div className="card">
          <div className="card-body">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-success-100 rounded-lg flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-success-600" />
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Income</p>
                <p className="text-2xl font-bold text-success-600">
                  {formatCurrency(totalIncome)}
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm text-success-600">
              <ArrowUpRight className="h-4 w-4 mr-1" />
              <span>This month</span>
            </div>
          </div>
        </div>

        {/* Total Expenses */}
        <div className="card">
          <div className="card-body">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-danger-100 rounded-lg flex items-center justify-center">
                  <TrendingDown className="h-5 w-5 text-danger-600" />
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Expenses</p>
                <p className="text-2xl font-bold text-danger-600">
                  {formatCurrency(totalExpenses)}
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm text-danger-600">
              <ArrowDownRight className="h-4 w-4 mr-1" />
              <span>This month</span>
            </div>
          </div>
        </div>

        {/* Net Cash Flow */}
        <div className="card">
          <div className="card-body">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  netCashFlow >= 0 ? 'bg-success-100' : 'bg-danger-100'
                }`}>
                  <DollarSign className={`h-5 w-5 ${
                    netCashFlow >= 0 ? 'text-success-600' : 'text-danger-600'
                  }`} />
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Net Cash Flow</p>
                <p className={`text-2xl font-bold ${
                  netCashFlow >= 0 ? 'text-success-600' : 'text-danger-600'
                }`}>
                  {formatCurrency(Math.abs(netCashFlow))}
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm text-gray-600">
              <span className={netCashFlow >= 0 ? 'text-success-600' : 'text-danger-600'}>
                {netCashFlow >= 0 ? 'Positive' : 'Negative'} balance
              </span>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="card">
          <div className="card-body">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center">
                  <Plus className="h-5 w-5 text-primary-600" />
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Quick Actions</p>
                <Link to="/add" className="text-primary-600 hover:text-primary-700 font-medium">
                  Add Transaction
                </Link>
              </div>
            </div>
            <div className="mt-4">
              <Link to="/analytics" className="text-sm text-gray-600 hover:text-gray-800">
                View Analytics →
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="card">
        <div className="card-header">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium text-gray-900">Recent Transactions</h3>
            <Link to="/transactions" className="text-sm text-primary-600 hover:text-primary-700">
              View all →
            </Link>
          </div>
        </div>
        <div className="card-body">
          {recentTransactions && recentTransactions.length > 0 ? (
            <div className="space-y-4">
              {recentTransactions.map((transaction) => (
                <div key={transaction.id} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-b-0">
                  <div className="flex items-center space-x-4">
                    <div className={`w-3 h-3 rounded-full ${
                      transaction.type === 'income' ? 'bg-success-500' : 'bg-danger-500'
                    }`} />
                    <div>
                      <p className="font-medium text-gray-900">{transaction.category}</p>
                      <p className="text-sm text-gray-500">{formatDate(transaction.date)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-medium ${
                      transaction.type === 'income' ? 'text-success-600' : 'text-danger-600'
                    }`}>
                      {transaction.type === 'income' ? '+' : '-'}{formatCurrency(transaction.amount)}
                    </p>
                    {transaction.description && (
                      <p className="text-sm text-gray-500 truncate max-w-xs">
                        {transaction.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <DollarSign className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No transactions yet</h3>
              <p className="mt-1 text-sm text-gray-500">
                Get started by adding your first transaction.
              </p>
              <div className="mt-6">
                <Link to="/add" className="btn-primary">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Transaction
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

