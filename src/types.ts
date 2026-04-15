export type TransactionType = 'earning' | 'payment' | 'expense';

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  description: string;
  timestamp: string;
  durationSeconds?: number; // Only for earnings
  isBadDay?: boolean; // Only for earnings
}

export interface Settings {
  weeklyGoal: number;
  valuePerAccount: number;
  activeAccounts: number;
}

export interface DashboardStats {
  grossProfit: number;
  totalExpenses: number;
  netProfit: number;
  hourlyRate: number;
  progressPercentage: number;
  status: 'profit' | 'warning' | 'loss';
}

export interface HourlyInsight {
  hour: number;
  totalEarnings: number;
  sessionCount: number;
  averageRate: number;
}
