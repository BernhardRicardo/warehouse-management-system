import React from 'react';

interface StockInputFieldProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  labelFor: string;
  label: string;
  loading?: boolean;
}

export const StockInputField = ({
  value,
  onChange,
  labelFor,
  label,
  loading,
}: StockInputFieldProps) => {
  return (
    <div>
      <label
        htmlFor={labelFor}
        className="text-sm font-medium text-gray-900 dark:text-white flex flex-col gap-1"
      >
        {label}
        <input
          disabled={loading}
          id={labelFor}
          name={labelFor}
          type="text"
          className="placeholder:text-xs placeholder:font-light bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
          placeholder="Masukan teks.."
          value={value}
          onChange={onChange}
        />
      </label>
    </div>
  );
};
