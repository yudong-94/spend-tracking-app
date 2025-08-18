import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { formatCurrency, formatDate } from '@spend-tracking/shared';
import { apiService } from '../services/api';
// import { Transaction } from '@spend-tracking/shared';
import { Search, Calendar, Tag } from 'lucide-react';

const Transactions: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [categoryFilter, setCategoryFilter] = useState('');

  const { data: transactionsData, isLoading, error } = useQuery(
    ['transactions'],
    () => apiService.getTransactions(),
    {
      refetchInterval: 300000, // Refetch every 5 minutes
    }
  );

  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-danger-600 text-lg font-medium mb-2">
          Failed to load transactions
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

  const transactions = transactionsData?.data || [];

  // Filter transactions
  const filteredTransactions = transactions.filter((transaction) => {
    const matchesSearch = 
      transaction.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (transaction.description && transaction.description.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesType = typeFilter === 'all' || transaction.type === typeFilter;
    
    const matchesCategory = !categoryFilter || transaction.category === categoryFilter;

    return matchesSearch && matchesType && matchesCategory;
  });

    // Sort transactions by date (newest first)
  const sortedTransactions = [...filteredTransactions].sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });
  
  // Get unique categories for filter
  const categories = Array.from(new Set(transactions.map(t => t.category))).sort();

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
        <p className="text-gray-600">View and manage all your financial transactions</p>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="card-body">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            {/* Search */}
            <div className="sm:col-span-2">
              <label htmlFor="search" className="sr-only">Search transactions</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  id="search"
                  placeholder="Search by category or description..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input pl-10"
                />
              </div>
            </div>

            {/* Type Filter */}
            <div>
              <label htmlFor="type-filter" className="sr-only">Filter by type</label>
              <select
                id="type-filter"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as 'all' | 'income' | 'expense')}
                className="input"
              >
                <option value="all">All Types</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
            </div>

            {/* Category Filter */}
            <div>
              <label htmlFor="category-filter" className="sr-only">Filter by category</label>
              <select
                id="category-filter"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="input"
              >
                <option value="">All Categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Transactions List */}
      <div className="card">
        <div className="card-header">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium text-gray-900">
              {sortedTransactions.length} Transaction{sortedTransactions.length !== 1 ? 's' : ''}
            </h3>
            <div className="text-sm text-gray-500">
              Total: {formatCurrency(
                sortedTransactions.reduce((sum, t) => sum + t.amount, 0)
              )}
            </div>
          </div>
        </div>
        <div className="card-body p-0">
          {sortedTransactions.length > 0 ? (
            <div className="divide-y divide-gray-200">
              {sortedTransactions.map((transaction) => (
                <div key={transaction.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className={`w-3 h-3 rounded-full ${
                        transaction.type === 'income' ? 'bg-success-500' : 'bg-danger-500'
                      }`} />
                      <div>
                        <div className="flex items-center space-x-2">
                          <p className="font-medium text-gray-900">{transaction.category}</p>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            transaction.type === 'income' 
                              ? 'bg-success-100 text-success-800' 
                              : 'bg-danger-100 text-danger-800'
                          }`}>
                            {transaction.type}
                          </span>
                        </div>
                        <div className="flex items-center space-x-4 text-sm text-gray-500 mt-1">
                          <div className="flex items-center">
                            <Calendar className="h-3 w-3 mr-1" />
                            {formatDate(transaction.date)}
                          </div>
                          {transaction.description && (
                            <div className="flex items-center">
                              <Tag className="h-3 w-3 mr-1" />
                              {transaction.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-semibold ${
                        transaction.type === 'income' ? 'text-success-600' : 'text-danger-600'
                      }`}>
                        {transaction.type === 'income' ? '+' : '-'}{formatCurrency(transaction.amount)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-gray-400 text-lg mb-2">
                {transactions.length === 0 ? 'No transactions found' : 'No transactions match your filters'}
              </div>
              <p className="text-gray-500">
                {transactions.length === 0 
                  ? 'Start by adding your first transaction.' 
                  : 'Try adjusting your search or filters.'
                }
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Transactions;
