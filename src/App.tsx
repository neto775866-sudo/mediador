/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Play, 
  Pause, 
  Square, 
  Settings as SettingsIcon, 
  LayoutDashboard, 
  History as HistoryIcon, 
  TrendingUp, 
  DollarSign, 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  XCircle,
  Download,
  Trash2,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Calendar
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  AreaChart,
  Area
} from 'recharts';
import * as XLSX from 'xlsx';
import { 
  format, 
  startOfWeek, 
  endOfWeek, 
  isWithinInterval, 
  parseISO, 
  subDays, 
  eachDayOfInterval,
  differenceInCalendarDays
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { Transaction, Settings, DashboardStats, HourlyInsight, TransactionType } from './types';
import { cn, formatCurrency, formatDuration } from './lib/utils';

// --- Constants ---
const STORAGE_KEY_TRANSACTIONS = 'mediador_transactions';
const STORAGE_KEY_SETTINGS = 'mediador_settings';

const DEFAULT_SETTINGS: Settings = {
  weeklyGoal: 1000,
  valuePerAccount: 250,
  activeAccounts: 1,
};

export default function App() {
  // --- State ---
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'settings'>('dashboard');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  
  // Timer State
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Modal State
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  // Temp Form State
  const [tempAmount, setTempAmount] = useState('');
  const [tempDescription, setTempDescription] = useState('');

  // --- Persistence ---
  useEffect(() => {
    const savedTransactions = localStorage.getItem(STORAGE_KEY_TRANSACTIONS);
    if (savedTransactions) setTransactions(JSON.parse(savedTransactions));

    const savedSettings = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (savedSettings) setSettings(JSON.parse(savedSettings));
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_TRANSACTIONS, JSON.stringify(transactions));
  }, [transactions]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
  }, [settings]);

  // --- Timer Logic ---
  useEffect(() => {
    if (isTimerRunning) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTimerRunning]);

  const handleStartTimer = () => {
    if (!startTime) setStartTime(new Date());
    setIsTimerRunning(true);
  };

  const handlePauseTimer = () => {
    setIsTimerRunning(false);
  };

  const handleStopTimer = () => {
    setIsTimerRunning(false);
    setIsRegisterModalOpen(true);
  };

  const handleSaveSession = () => {
    const amount = parseFloat(tempAmount) || 0;
    const newTransaction: Transaction = {
      id: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
      type: 'earning',
      amount,
      description: `Turno de ${formatDuration(elapsedSeconds)}`,
      timestamp: new Date().toISOString(),
      durationSeconds: elapsedSeconds,
    };
    setTransactions(prev => [newTransaction, ...prev]);
    
    // Reset Timer
    setStartTime(null);
    setElapsedSeconds(0);
    setTempAmount('');
    setIsRegisterModalOpen(false);
  };

  const handleAddTransaction = (type: TransactionType) => {
    const amount = parseFloat(tempAmount) || 0;
    if (amount <= 0) return;

    const newTransaction: Transaction = {
      id: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
      type,
      amount,
      description: tempDescription || (type === 'payment' ? 'Pagamento Semanal' : 'Retirada'),
      timestamp: new Date().toISOString(),
    };

    setTransactions(prev => [newTransaction, ...prev]);
    setTempAmount('');
    setTempDescription('');
    setIsExpenseModalOpen(false);
    setIsPaymentModalOpen(false);
    showNotification(type === 'payment' ? 'Pagamento registrado!' : 'Retirada registrada!');
  };

  // --- Calculations ---
  const stats = useMemo((): DashboardStats => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

    const weeklyTransactions = transactions.filter(t => 
      isWithinInterval(parseISO(t.timestamp), { start: weekStart, end: weekEnd })
    );

    const grossProfit = weeklyTransactions
      .filter(t => t.type === 'earning')
      .reduce((acc, t) => acc + t.amount, 0);
    
    const totalExpenses = weeklyTransactions
      .filter(t => t.type === 'payment' || t.type === 'expense')
      .reduce((acc, t) => acc + t.amount, 0);
    
    const netProfit = grossProfit - totalExpenses;
    
    const totalSeconds = weeklyTransactions
      .filter(t => t.type === 'earning')
      .reduce((acc, t) => acc + (t.durationSeconds || 0), 0);
    
    const hourlyRate = totalSeconds > 0 ? (grossProfit / (totalSeconds / 3600)) : 0;
    
    const progressPercentage = Math.min(100, (grossProfit / settings.weeklyGoal) * 100);

    let status: DashboardStats['status'] = 'warning';
    if (netProfit < 0) status = 'loss';
    else if (grossProfit >= settings.weeklyGoal) status = 'profit';

    return {
      grossProfit,
      totalExpenses,
      netProfit,
      hourlyRate,
      progressPercentage,
      status
    };
  }, [transactions, settings]);

  const chartData = useMemo(() => {
    const now = new Date();
    const days = eachDayOfInterval({
      start: subDays(now, 6),
      end: now
    });

    return days.map(day => {
      const dayStr = format(day, 'yyyy-MM-dd');
      const dayTransactions = transactions.filter(t => t.timestamp.startsWith(dayStr));
      const earnings = dayTransactions
        .filter(t => t.type === 'earning')
        .reduce((acc, t) => acc + t.amount, 0);
      return {
        name: format(day, 'EEE', { locale: ptBR }),
        earnings,
      };
    });
  }, [transactions]);

  const hourlyInsights = useMemo((): HourlyInsight[] => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    return hours.map(hour => {
      const hourTransactions = transactions.filter(t => {
        if (t.type !== 'earning') return false;
        const date = parseISO(t.timestamp);
        return date.getHours() === hour;
      });

      const totalEarnings = hourTransactions.reduce((acc, t) => acc + t.amount, 0);
      const totalSeconds = hourTransactions.reduce((acc, t) => acc + (t.durationSeconds || 0), 0);
      const averageRate = totalSeconds > 0 ? (totalEarnings / (totalSeconds / 3600)) : 0;

      return {
        hour,
        totalEarnings,
        sessionCount: hourTransactions.length,
        averageRate
      };
    }).filter(h => h.sessionCount > 0);
  }, [transactions]);

  const bestHour = useMemo(() => {
    if (hourlyInsights.length === 0) return null;
    return [...hourlyInsights].sort((a, b) => b.averageRate - a.averageRate)[0];
  }, [hourlyInsights]);

  // --- Actions ---
  const handleResetWeek = () => {
    setIsResetConfirmOpen(true);
  };

  const confirmResetWeek = () => {
    setTransactions([]);
    setIsResetConfirmOpen(false);
    showNotification('Dados resetados com sucesso!');
  };

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleExportExcel = () => {
    const data = transactions.map(t => ({
      Data: format(parseISO(t.timestamp), 'dd/MM/yyyy HH:mm'),
      Tipo: t.type === 'earning' ? 'Ganho' : t.type === 'payment' ? 'Pagamento' : 'Retirada',
      Descrição: t.description,
      Valor: t.amount,
      Duração: t.durationSeconds ? formatDuration(t.durationSeconds) : '-',
      'Dia Ruim': t.isBadDay ? 'Sim' : 'Não'
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Relatório Mediador');
    XLSX.writeFile(wb, `Relatorio_Mediador_${format(new Date(), 'dd_MM_yyyy')}.xlsx`);
  };

  const handleDeleteTransaction = (id: string) => {
    setTransactions(prev => prev.filter(t => t.id !== id));
  };

  const toggleBadDay = (id: string) => {
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, isBadDay: !t.isBadDay } : t));
  };

  // --- Render Helpers ---
  const renderStatusBadge = () => {
    const config = {
      profit: { 
        label: 'Indo bem', 
        color: 'text-green-400 bg-green-400/10 border-green-400/20 glow-green', 
        icon: CheckCircle2,
        reason: 'Meta atingida!',
        tip: 'Você já superou sua meta semanal de ganhos bruto. Excelente desempenho!'
      },
      warning: { 
        label: 'Cuidado', 
        color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20 glow-yellow', 
        icon: AlertCircle,
        reason: 'Meta pendente',
        tip: `Seu saldo está positivo, mas faltam ${formatCurrency(settings.weeklyGoal - stats.grossProfit)} para atingir sua meta de ${formatCurrency(settings.weeklyGoal)}.`
      },
      loss: { 
        label: 'Prejuízo', 
        color: 'text-red-400 bg-red-400/10 border-red-400/20 glow-red', 
        icon: XCircle,
        reason: 'Saldo negativo',
        tip: 'Suas saídas (pagamentos/gastos) superaram seus ganhos. Foque em registrar mais turnos para equilibrar o caixa.'
      },
    };
    const { label, color, icon: Icon, reason, tip } = config[stats.status];

    return (
      <div className={cn("group relative flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-medium cursor-help transition-all", color)}>
        <Icon size={14} />
        {label}

        {/* Tooltip */}
        <div className="absolute top-full left-0 mt-2 w-64 p-4 rounded-2xl bg-[#0a0a0a] border border-white/10 backdrop-blur-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none">
          <div className="flex items-center gap-2 mb-1">
            <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", color.split(' ')[0].replace('text-', 'bg-'))} />
            <p className="text-white font-bold text-[13px]">{reason}</p>
          </div>
          <p className="text-muted-foreground text-[11px] leading-relaxed">{tip}</p>
          <div className="absolute -top-1 left-6 w-2 h-2 bg-[#0a0a0a] border-t border-l border-white/10 rotate-45" />
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-black text-white overflow-hidden font-sans">
      {/* --- Sidebar --- */}
      <aside className="w-64 border-r border-white/5 bg-card/50 backdrop-blur-xl flex flex-col">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center glow-blue">
              <TrendingUp size={24} className="text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Mediador</h1>
          </div>

          <nav className="space-y-2">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
              { id: 'history', label: 'Histórico', icon: HistoryIcon },
              { id: 'settings', label: 'Configurações', icon: SettingsIcon },
            ].map(item => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                  activeTab === item.id 
                    ? "bg-primary/10 text-primary border border-primary/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]" 
                    : "text-muted-foreground hover:text-white hover:bg-white/5"
                )}
              >
                <item.icon size={20} />
                <span className="font-medium">{item.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="mt-auto p-6 border-t border-white/5">
          <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
            <p className="text-xs text-muted-foreground mb-1">Meta Semanal</p>
            <div className="flex items-end justify-between mb-2">
              <span className="text-lg font-bold">{formatCurrency(stats.grossProfit)}</span>
              <span className="text-xs text-muted-foreground">/ {formatCurrency(settings.weeklyGoal)}</span>
            </div>
            <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${stats.progressPercentage}%` }}
                className="h-full bg-primary glow-blue"
              />
            </div>
          </div>
        </div>
      </aside>

      {/* --- Main Content --- */}
      <main className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-from)_0%,_transparent_40%)] from-primary/5">
        <header className="h-20 border-b border-white/5 flex items-center justify-between px-8 sticky top-0 bg-black/50 backdrop-blur-md z-10">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold capitalize">{activeTab}</h2>
            {renderStatusBadge()}
          </div>

          <div className="flex items-center gap-4">
            {/* Timer Widget */}
            <div className={cn(
              "flex items-center gap-4 px-4 py-2 rounded-2xl border transition-all duration-300",
              isTimerRunning ? "bg-primary/10 border-primary/30 glow-blue" : "bg-white/5 border-white/10"
            )}>
              <div className="flex flex-col items-end">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">
                  {isTimerRunning ? 'Sessão Ativa' : 'Cronômetro'}
                </span>
                <span className="text-xl font-mono font-bold tabular-nums">
                  {formatDuration(elapsedSeconds)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {!isTimerRunning ? (
                  <button 
                    onClick={handleStartTimer}
                    className="w-10 h-10 rounded-full bg-primary flex items-center justify-center hover:scale-105 transition-transform glow-blue"
                  >
                    <Play size={18} fill="white" />
                  </button>
                ) : (
                  <>
                    <button 
                      onClick={handlePauseTimer}
                      className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                    >
                      <Pause size={18} fill="white" />
                    </button>
                    <button 
                      onClick={handleStopTimer}
                      className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center hover:scale-105 transition-transform glow-red"
                    >
                      <Square size={18} fill="white" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        <div className="p-8 max-w-7xl mx-auto">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {[
                    { label: 'Lucro Bruto', value: formatCurrency(stats.grossProfit), icon: DollarSign, color: 'text-blue-400', trend: 'Total ganho' },
                    { label: 'Lucro Líquido', value: formatCurrency(stats.netProfit), icon: TrendingUp, color: stats.netProfit >= 0 ? 'text-green-400' : 'text-red-400', trend: stats.netProfit >= 0 ? 'Saldo real' : 'Saldo negativo' },
                    { label: 'Total Saídas', value: formatCurrency(stats.totalExpenses), icon: ArrowDownRight, color: 'text-orange-400', trend: 'Pagamentos e gastos' },
                    { label: 'Ganho por Hora', value: `${formatCurrency(stats.hourlyRate)}/h`, icon: Clock, color: 'text-purple-400', trend: 'Média de eficiência' },
                  ].map((stat, i) => (
                    <div key={i} className="glass-card p-6 rounded-3xl relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <stat.icon size={48} />
                      </div>
                      <p className="text-sm text-muted-foreground mb-1">{stat.label}</p>
                      <h3 className="text-2xl font-bold mb-2">{stat.value}</h3>
                      <div className="flex items-center gap-1 text-xs">
                        <span className={stat.color}>{stat.trend}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Charts Section */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 space-y-6">
                    <div className="glass-card p-6 rounded-3xl">
                      <div className="flex items-center justify-between mb-6">
                        <h4 className="font-semibold">Evolução do Lucro</h4>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <div className="w-3 h-3 rounded-full bg-primary" />
                          Ganhos Diários
                        </div>
                      </div>
                      <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chartData}>
                            <defs>
                              <linearGradient id="colorEarnings" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                            <XAxis 
                              dataKey="name" 
                              stroke="#ffffff40" 
                              fontSize={12} 
                              tickLine={false} 
                              axisLine={false} 
                            />
                            <YAxis 
                              stroke="#ffffff40" 
                              fontSize={12} 
                              tickLine={false} 
                              axisLine={false}
                              tickFormatter={(value) => `R$${value}`}
                            />
                            <Tooltip 
                              contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid #ffffff10', borderRadius: '12px' }}
                              itemStyle={{ color: '#3b82f6' }}
                            />
                            <Area 
                              type="monotone" 
                              dataKey="earnings" 
                              stroke="#3b82f6" 
                              strokeWidth={3}
                              fillOpacity={1} 
                              fill="url(#colorEarnings)" 
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="glass-card p-6 rounded-3xl">
                      <div className="flex items-center justify-between mb-6">
                        <h4 className="font-semibold">Desempenho por Hora</h4>
                        <p className="text-xs text-muted-foreground">R$/hora médio</p>
                      </div>
                      <div className="h-[200px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={hourlyInsights}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                            <XAxis 
                              dataKey="hour" 
                              stroke="#ffffff40" 
                              fontSize={10} 
                              tickLine={false} 
                              axisLine={false}
                              tickFormatter={(value) => `${value}h`}
                            />
                            <YAxis 
                              stroke="#ffffff40" 
                              fontSize={10} 
                              tickLine={false} 
                              axisLine={false}
                              tickFormatter={(value) => `R$${value}`}
                            />
                            <Tooltip 
                              contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid #ffffff10', borderRadius: '12px' }}
                              cursor={{ fill: '#ffffff05' }}
                            />
                            <Bar dataKey="averageRate" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                              {hourlyInsights.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.averageRate > stats.hourlyRate ? '#3b82f6' : '#3b82f640'} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  <div className="glass-card p-6 rounded-3xl flex flex-col">
                    <h4 className="font-semibold mb-6">Ações Financeiras</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <button 
                        onClick={() => {
                          setTempAmount(settings.valuePerAccount.toString());
                          setIsPaymentModalOpen(true);
                        }}
                        className="p-4 rounded-2xl bg-green-500/5 border border-green-500/10 text-green-400 hover:bg-green-500/10 transition-colors flex flex-col items-center gap-2"
                      >
                        <DollarSign size={24} />
                        <span className="text-xs font-medium">Pagar Semanal</span>
                      </button>
                      <button 
                        onClick={() => setIsExpenseModalOpen(true)}
                        className="p-4 rounded-2xl bg-orange-500/5 border border-orange-500/10 text-orange-400 hover:bg-orange-500/10 transition-colors flex flex-col items-center gap-2"
                      >
                        <ArrowDownRight size={24} />
                        <span className="text-xs font-medium">Retirada</span>
                      </button>
                    </div>
                    
                    <button 
                      onClick={handleExportExcel}
                      className="mt-6 w-full py-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center gap-2 hover:bg-white/10 transition-colors text-sm font-medium"
                    >
                      <Download size={18} />
                      Exportar Relatório
                    </button>
                  </div>
                </div>

                {/* Simulation & Quick Actions */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="glass-card p-6 rounded-3xl">
                    <h4 className="font-semibold mb-4">Simulação de Performance</h4>
                    <div className="space-y-4">
                      {[3, 4, 5].map(n => {
                        const currentAvg = stats.hourlyRate;
                        const diff = n - settings.activeAccounts;
                        const estimatedIncrease = currentAvg * 0.15 * diff; // Estimated 15% increase per account
                        const newAvg = currentAvg + estimatedIncrease;
                        const pctChange = ((newAvg - currentAvg) / currentAvg) * 100;

                        return (
                          <div key={n} className={cn(
                            "p-4 rounded-2xl border flex items-center justify-between",
                            n === settings.activeAccounts ? "border-primary/30 bg-primary/5" : "border-white/5 bg-white/5"
                          )}>
                            <div>
                              <p className="text-sm font-bold">{n} Contas</p>
                              <p className="text-xs text-muted-foreground">Estimativa: {formatCurrency(newAvg)}/h</p>
                            </div>
                            <div className="text-right">
                              <p className={cn(
                                "text-sm font-bold",
                                pctChange >= 0 ? "text-green-400" : "text-red-400"
                              )}>
                                {pctChange >= 0 ? '+' : ''}{pctChange.toFixed(1)}%
                              </p>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Média Estimada</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="glass-card p-6 rounded-3xl flex flex-col justify-between">
                    <div>
                      <h4 className="font-semibold mb-2">Insights do Período</h4>
                      <div className="space-y-4 mt-4">
                        {bestHour && (
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-primary/10 text-primary">
                              <Clock size={16} />
                            </div>
                            <div>
                              <p className="text-sm font-medium">Melhor Horário</p>
                              <p className="text-xs text-muted-foreground">{bestHour.hour}h às {bestHour.hour + 1}h ({formatCurrency(bestHour.averageRate)}/h)</p>
                            </div>
                          </div>
                        )}
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-green-500/10 text-green-400">
                            <TrendingUp size={16} />
                          </div>
                          <div>
                            <p className="text-sm font-medium">Eficiência Semanal</p>
                            <p className="text-xs text-muted-foreground">{formatCurrency(stats.hourlyRate)}/h média atual</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-6">
                      <button 
                        onClick={handleResetWeek}
                        className="p-4 rounded-2xl bg-red-500/5 border border-red-500/10 text-red-400 hover:bg-red-500/10 transition-colors flex flex-col items-center gap-2"
                      >
                        <Trash2 size={24} />
                        <span className="text-xs font-medium">Resetar Semana</span>
                      </button>
                      <button 
                        onClick={() => setActiveTab('history')}
                        className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/10 text-blue-400 hover:bg-blue-500/10 transition-colors flex flex-col items-center gap-2"
                      >
                        <HistoryIcon size={24} />
                        <span className="text-xs font-medium">Ver Histórico</span>
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'history' && (
              <motion.div
                key="history"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-bold">Histórico de Transações</h3>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => setIsExpenseModalOpen(true)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500/20 transition-colors text-sm font-medium"
                    >
                      <ArrowDownRight size={18} />
                      Nova Retirada
                    </button>
                    <button 
                      onClick={handleExportExcel}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary/90 transition-colors text-sm font-medium shadow-lg shadow-primary/20"
                    >
                      <Download size={18} />
                      Exportar Excel
                    </button>
                  </div>
                </div>

                <div className="glass-card rounded-3xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/5 bg-white/5">
                        <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Data & Hora</th>
                        <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tipo</th>
                        <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Descrição</th>
                        <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Valor</th>
                        <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {transactions.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                            Nenhuma transação registrada ainda.
                          </td>
                        </tr>
                      ) : (
                        transactions.map((t) => (
                          <tr key={t.id} className="hover:bg-white/5 transition-colors group">
                            <td className="px-6 py-4">
                              <div className="flex flex-col">
                                <span className="text-sm font-medium">{format(parseISO(t.timestamp), 'dd MMM, yyyy', { locale: ptBR })}</span>
                                <span className="text-xs text-muted-foreground">{format(parseISO(t.timestamp), 'HH:mm')}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                {t.type === 'earning' ? (
                                  <div className="p-1.5 rounded-lg bg-green-500/10 text-green-400"><TrendingUp size={14} /></div>
                                ) : t.type === 'payment' ? (
                                  <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400"><DollarSign size={14} /></div>
                                ) : (
                                  <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-400"><ArrowDownRight size={14} /></div>
                                )}
                                <span className="text-xs font-medium capitalize">
                                  {t.type === 'earning' ? 'Ganho' : t.type === 'payment' ? 'Pagamento' : 'Retirada'}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-sm text-muted-foreground">{t.description}</span>
                            </td>
                            <td className="px-6 py-4">
                              <span className={cn(
                                "text-sm font-bold",
                                t.type === 'earning' ? "text-green-400" : "text-red-400"
                              )}>
                                {t.type === 'earning' ? '+' : '-'}{formatCurrency(t.amount)}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button 
                                onClick={() => handleDeleteTransaction(t.id)}
                                className="p-2 text-muted-foreground hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                              >
                                <Trash2 size={18} />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {activeTab === 'settings' && (
              <motion.div
                key="settings"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="max-w-2xl space-y-8"
              >
                <h3 className="text-2xl font-bold">Configurações</h3>
                
                <div className="glass-card p-8 rounded-3xl space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Meta Semanal (R$)</label>
                    <div className="relative">
                      <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
                      <input 
                        type="number" 
                        value={settings.weeklyGoal}
                        onChange={(e) => setSettings(prev => ({ ...prev, weeklyGoal: parseFloat(e.target.value) || 0 }))}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                        placeholder="Ex: 1000"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Valor por Conta (Semanal)</label>
                      <input 
                        type="number" 
                        value={settings.valuePerAccount}
                        onChange={(e) => setSettings(prev => ({ ...prev, valuePerAccount: parseFloat(e.target.value) || 0 }))}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                        placeholder="Ex: 250"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Contas Ativas</label>
                      <input 
                        type="number" 
                        value={settings.activeAccounts}
                        onChange={(e) => setSettings(prev => ({ ...prev, activeAccounts: parseInt(e.target.value) || 1 }))}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                        placeholder="Ex: 1"
                      />
                    </div>
                  </div>

                  <div className="pt-4">
                    <div className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/10 flex items-start gap-4">
                      <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
                        <AlertCircle size={20} />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Custo Operacional</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Seu custo diário atual é de <span className="text-white font-bold">{formatCurrency((settings.valuePerAccount / 7) * settings.activeAccounts)}</span>. 
                          Este valor será deduzido do seu lucro bruto para calcular o lucro líquido.
                        </p>
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={() => showNotification('Configurações salvas automaticamente!')}
                    className="w-full py-4 rounded-2xl bg-primary text-white font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                  >
                    Salvar Configurações
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* --- Register Earnings Modal --- */}
      <AnimatePresence>
        {isRegisterModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsRegisterModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md glass-card p-8 rounded-[2rem] shadow-2xl border-white/10"
            >
              <div className="flex flex-col items-center text-center mb-8">
                <div className="w-16 h-16 rounded-2xl bg-green-500/10 text-green-400 flex items-center justify-center mb-4">
                  <CheckCircle2 size={32} />
                </div>
                <h3 className="text-2xl font-bold">Sessão Finalizada!</h3>
                <p className="text-muted-foreground mt-1">Quanto você ganhou neste turno?</p>
                <div className="mt-4 px-4 py-2 rounded-xl bg-white/5 border border-white/5 font-mono text-lg">
                  {formatDuration(elapsedSeconds)} trabalhados
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Valor Ganho (R$)</label>
                  <div className="relative">
                    <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
                    <input 
                      autoFocus
                      type="number" 
                      value={tempAmount}
                      onChange={(e) => setTempAmount(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveSession()}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                      placeholder="0,00"
                    />
                  </div>
                </div>

                <div className="flex gap-4">
                  <button 
                    onClick={() => setIsRegisterModalOpen(false)}
                    className="flex-1 py-4 rounded-2xl bg-white/5 text-white font-medium hover:bg-white/10 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={handleSaveSession}
                    className="flex-1 py-4 rounded-2xl bg-primary text-white font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                  >
                    Salvar Registro
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- Expense/Withdrawal Modal --- */}
      <AnimatePresence>
        {(isExpenseModalOpen || isPaymentModalOpen) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsExpenseModalOpen(false);
                setIsPaymentModalOpen(false);
              }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md glass-card p-8 rounded-[2rem] shadow-2xl border-white/10"
            >
              <div className="flex flex-col items-center text-center mb-8">
                <div className={cn(
                  "w-16 h-16 rounded-2xl flex items-center justify-center mb-4",
                  isPaymentModalOpen ? "bg-blue-500/10 text-blue-400" : "bg-orange-500/10 text-orange-400"
                )}>
                  {isPaymentModalOpen ? <DollarSign size={32} /> : <ArrowDownRight size={32} />}
                </div>
                <h3 className="text-2xl font-bold">{isPaymentModalOpen ? 'Pagar Semanal' : 'Registrar Retirada'}</h3>
                <p className="text-muted-foreground mt-1">
                  {isPaymentModalOpen ? 'Informe o valor do pagamento das contas.' : 'Informe o valor e o motivo da retirada.'}
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Valor (R$)</label>
                  <div className="relative">
                    <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
                    <input 
                      autoFocus
                      type="number" 
                      value={tempAmount}
                      onChange={(e) => setTempAmount(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                      placeholder="0,00"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Descrição (Opcional)</label>
                  <input 
                    type="text" 
                    value={tempDescription}
                    onChange={(e) => setTempDescription(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                    placeholder={isPaymentModalOpen ? "Ex: Pagamento Semanal" : "Ex: Almoço, Gasolina..."}
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    onClick={() => {
                      setIsExpenseModalOpen(false);
                      setIsPaymentModalOpen(false);
                    }}
                    className="flex-1 py-4 rounded-2xl bg-white/5 text-white font-medium hover:bg-white/10 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={() => handleAddTransaction(isPaymentModalOpen ? 'payment' : 'expense')}
                    className={cn(
                      "flex-1 py-4 rounded-2xl text-white font-bold transition-all shadow-lg",
                      isPaymentModalOpen ? "bg-blue-500 hover:bg-blue-600 shadow-blue-500/20" : "bg-orange-500 hover:bg-orange-600 shadow-orange-500/20"
                    )}
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- Reset Confirmation Modal --- */}
      <AnimatePresence>
        {isResetConfirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsResetConfirmOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md glass-card p-8 rounded-[2rem] shadow-2xl border-white/10"
            >
              <div className="flex flex-col items-center text-center mb-8">
                <div className="w-16 h-16 rounded-2xl bg-red-500/10 text-red-400 flex items-center justify-center mb-4">
                  <Trash2 size={32} />
                </div>
                <h3 className="text-2xl font-bold">Resetar Semana?</h3>
                <p className="text-muted-foreground mt-1">Esta ação não pode ser desfeita. Todos os registros da semana atual serão excluídos.</p>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => setIsResetConfirmOpen(false)}
                  className="flex-1 py-4 rounded-2xl bg-white/5 text-white font-medium hover:bg-white/10 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={confirmResetWeek}
                  className="flex-1 py-4 rounded-2xl bg-red-500 text-white font-bold hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
                >
                  Confirmar Reset
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- Notification Toast --- */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[60]"
          >
            <div className={cn(
              "px-6 py-3 rounded-full border shadow-2xl flex items-center gap-3",
              notification.type === 'success' ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-red-500/10 border-red-500/20 text-red-400"
            )}>
              {notification.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              <span className="text-sm font-medium">{notification.message}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
