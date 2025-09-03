import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from 'react-query';
import { Plus, CheckCircle, AlertCircle } from 'lucide-react';
import { apiService } from '../services/api';
import { Transaction } from '@spend-tracking/shared';
import TransactionForm from '../components/TransactionForm';
import { createTransaction, Transaction } from "@/lib/api";

export default function AddTransaction() {
  const [form, setForm] = useState<Transaction>({
    Date: new Date().toISOString().slice(0, 10),
    Type: "Expense",
    Category: "",
    Amount: 0,
    Account: "",
    Description: "",
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createTransaction(form);
    alert("Saved!");
    // optionally reset or navigate
  };

  // ...your form UI; call setForm on changes
  return <form onSubmit={onSubmit}>{/* fields */}</form>;
}

const AddTransaction: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const addTransactionMutation = useMutation(
    (transaction: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) =>
      apiService.addTransaction(transaction),
    {
      onSuccess: (data) => {
        if (data.success) {
          setIsSuccess(true);
          // Invalidate and refetch queries
          queryClient.invalidateQueries(['dashboard-analytics']);
          queryClient.invalidateQueries(['recent-transactions']);
          queryClient.invalidateQueries(['transactions']);
          
          // Redirect after a short delay
          setTimeout(() => {
            navigate('/');
          }, 2000);
        } else {
          setErrorMessage(data.error || 'Failed to add transaction');
        }
      },
      onError: (error: any) => {
        setErrorMessage(error.message || 'An unexpected error occurred');
      },
    }
  );

  const handleSubmit = (transaction: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => {
    setErrorMessage('');
    addTransactionMutation.mutate(transaction);
  };

  const handleCancel = () => {
    navigate('/');
  };

  if (isSuccess) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="text-center py-12">
          <CheckCircle className="mx-auto h-16 w-16 text-success-600 mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Transaction Added Successfully!
          </h1>
          <p className="text-gray-600 mb-6">
            Your transaction has been saved to your Google Sheets.
          </p>
          <div className="text-sm text-gray-500">
            Redirecting to dashboard...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center mb-2">
          <Plus className="h-8 w-8 text-primary-600 mr-3" />
          <h1 className="text-2xl font-bold text-gray-900">Add New Transaction</h1>
        </div>
        <p className="text-gray-600">
          Record a new income or expense to track your spending.
        </p>
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="mb-6 p-4 bg-danger-50 border border-danger-200 rounded-md">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-danger-400 mr-2" />
            <div className="text-sm text-danger-700">
              {errorMessage}
            </div>
          </div>
        </div>
      )}

      {/* Transaction Form */}
      <div className="card">
        <div className="card-body">
          <TransactionForm
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            isLoading={addTransactionMutation.isLoading}
          />
        </div>
      </div>

      {/* Help Text */}
      <div className="mt-6 text-sm text-gray-500">
        <p className="mb-2">
          <strong>Tip:</strong> Be specific with categories to get better insights into your spending patterns.
        </p>
        <p>
          All transactions are automatically synced with your Google Sheets for easy access and backup.
        </p>
      </div>
    </div>
  );
};

export default AddTransaction;

