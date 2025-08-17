import React from 'react';
import { useForm } from 'react-hook-form';
import { Transaction } from '@spend-tracking/shared';
import { DollarSign, Calendar, Tag, FileText, Save, X } from 'lucide-react';
import { useQuery } from 'react-query';
import { apiService } from '../services/api';

interface TransactionFormProps {
  transaction?: Partial<Transaction>;
  onSubmit: (data: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

interface FormData {
  date: string;
  amount: string;
  type: 'income' | 'expense';
  category: string;
  description: string;
}

const TransactionForm: React.FC<TransactionFormProps> = ({
  transaction,
  onSubmit,
  onCancel,
  isLoading = false,
}) => {
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    //watch,
  } = useForm<FormData>({
    defaultValues: {
      date: transaction?.date || new Date().toISOString().split('T')[0],
      amount: transaction?.amount?.toString() || '',
      type: transaction?.type || 'expense',
      category: transaction?.category || '',
      description: transaction?.description || '',
    },
    mode: 'onChange',
  });

  // const watchType = watch('type');

  const handleFormSubmit = (data: FormData) => {
    onSubmit({
      date: data.date,
      amount: parseFloat(data.amount),
      type: data.type,
      category: data.category,
      description: data.description,
    });
  };

  const { data: categories = [] } = useQuery(
    'categories',
    () => apiService.getCategories(),
    {
      staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    }
  );

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* Date Field */}
        <div>
          <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-2">
            Date
          </label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              {...register('date', { required: 'Date is required' })}
              type="date"
              id="date"
              className="input pl-10"
            />
          </div>
          {errors.date && (
            <p className="mt-1 text-sm text-danger-600">{errors.date.message}</p>
          )}
        </div>

        {/* Amount Field */}
        <div>
          <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-2">
            Amount
          </label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              {...register('amount', {
                required: 'Amount is required',
                pattern: {
                  value: /^\d+(\.\d{1,2})?$/,
                  message: 'Please enter a valid amount',
                },
                min: {
                  value: 0.01,
                  message: 'Amount must be greater than 0',
                },
              })}
              type="number"
              step="0.01"
              min="0.01"
              id="amount"
              placeholder="0.00"
              className="input pl-10"
            />
          </div>
          {errors.amount && (
            <p className="mt-1 text-sm text-danger-600">{errors.amount.message}</p>
          )}
        </div>

        {/* Type Field */}
        <div>
          <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-2">
            Type
          </label>
          <select
            {...register('type', { required: 'Type is required' })}
            id="type"
            className="input"
          >
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
          {errors.type && (
            <p className="mt-1 text-sm text-danger-600">{errors.type.message}</p>
          )}
        </div>

        {/* Category Field */}
        <div className="col-span-2">
          <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
            Category
          </label>
          <div className="relative">
            <Tag className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <select
              id="category"
              {...register('category', { required: 'Category is required' })}
              className="input pl-10 w-full"
            >
              <option value="">Select a category...</option>
              {categories.map((category: any) => (
                <option key={typeof category === 'string' ? category : category.id} value={typeof category === 'string' ? category : category.name}>
                  {typeof category === 'string' ? category : category.name}
                </option>
              ))}
            </select>
          </div>
          {errors.category && (
            <p className="text-danger-600 text-sm mt-1">{errors.category.message}</p>
          )}
        </div>

      {/* Description Field */}
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
          Description (Optional)
        </label>
        <div className="relative">
          <FileText className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
          <textarea
            {...register('description')}
            id="description"
            rows={3}
            placeholder="Add a description for this transaction..."
            className="input pl-10 resize-none"
          />
        </div>
        {errors.description && (
          <p className="mt-1 text-sm text-danger-600">{errors.description.message}</p>
        )}
      </div>
    </div>

      {/* Form Actions */}
      <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          className="btn-secondary"
        >
          <X className="h-4 w-4 mr-2" />
          Cancel
        </button>
        <button
          type="submit"
          disabled={!isValid || isLoading}
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="h-4 w-4 mr-2" />
          {isLoading ? 'Saving...' : transaction ? 'Update Transaction' : 'Add Transaction'}
        </button>
      </div>
    </form>
  );
};

export default TransactionForm;
