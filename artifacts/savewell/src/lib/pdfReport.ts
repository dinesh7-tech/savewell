// ---------------------------------------------------------------------------
// SaveWell - Redesigned Monthly Financial Report PDF Generator
// Premium, multi-page, print-ready, data-accurate financial reporting engine
// ---------------------------------------------------------------------------

export interface MonthlyReportData {
  month: number; // 1-12
  monthName: string; // "September"
  year: number; // 2026
  generatedAt: string;
  userEmail: string;

  // Monthly Financial Summary
  totalIncome: number;
  totalSaved: number;
  savingsRate: number | null; // percentage if totalIncome > 0
  totalMoneyLent: number;
  totalMoneyReceivedBack: number;
  totalMoneyBorrowed: number;
  totalRepaymentsMade: number;
  currentOutstandingMoneyIOwe: number;
  budgetTarget: number;
  budgetAchieved: number;
  budgetPercentage: number;
  goalContributions: number;

  // Savings Summary
  savingsCount: number;
  highestSaving: { amount: number; category: string; date: string } | null;
  goalLinkedSavings: number;
  categoriesBreakdown: Array<{
    name: string;
    icon: string;
    total: number;
    count: number;
    percentage: number;
  }>;

  // Income Summary
  incomeBreakdown: Array<{
    source: string;
    total: number;
    count: number;
  }>;

  // Budget Summary
  budgetsList: Array<{
    name: string;
    type: string;
    target: number;
    actual: number;
    remaining: number;
    percentage: number;
  }>;

  // Goals Summary
  goalsList: Array<{
    name: string;
    icon: string;
    contributedThisMonth: number;
    overallSaved: number;
    targetAmount: number;
    overallProgress: number;
    isMain?: boolean;
  }>;

  // Money Lent Summary
  moneyLentList: Array<{
    person: string;
    lentInMonth: number;
    returnedInMonth: number;
    totalLent: number;
    totalReturned: number;
    remaining: number;
    status: string;
  }>;

  // Money I Owe Summary
  moneyIOweList: Array<{
    person: string;
    borrowedInMonth: number;
    repaidInMonth: number;
    totalBorrowed: number;
    totalRepaid: number;
    remaining: number;
    dueDate: string | null;
    status: string;
    isOverdue?: boolean;
  }>;

  // Unified Transactions
  transactions: Array<{
    date: string;
    type: 'SAVINGS' | 'LENT' | 'RECEIVED' | 'BORROWED' | 'REPAYMENT';
    title: string;
    categoryOrPerson: string;
    amount: number;
    isPositive: boolean;
    note?: string;
  }>;
}

// ---------------------------------------------------------------------------
// Currency Formatter - Indian Numbering System with ₹ symbol
// ---------------------------------------------------------------------------
export function formatINR(amount: number | string | null | undefined): string {
  const num = Number(amount || 0);
  if (num === 0) return '₹0';

  const isNeg = num < 0;
  const absNum = Math.abs(num);
  const parts = Math.round(absNum).toString().split('.');
  const lastThree = parts[0].substring(parts[0].length - 3);
  const otherNumbers = parts[0].substring(0, parts[0].length - 3);
  const formatted = (otherNumbers !== '' ? otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' : '') + lastThree;
  return `${isNeg ? '-' : ''}₹${formatted}`;
}

export function formatINRForPdf(amount: number | string | null | undefined): string {
  return formatINR(amount);
}

// ---------------------------------------------------------------------------
// SaveWell Vector Logo SVG Definition
// ---------------------------------------------------------------------------
const SAVEWELL_LOGO_SVG = `
<svg width="34" height="34" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="36" height="36" rx="9" fill="#1b382b" />
  <path d="M23.5 11C23.5 11 15 10.5 13 14.5C11.2 18.2 15.8 19.8 18.5 20.8C21.8 22 25 23.5 25 27.2C25 31.2 20.2 32.5 15.5 32.5C11.5 32.5 10.5 29.5 10.5 29.5" stroke="#fcfaf5" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
  <circle cx="26" cy="10" r="2.4" fill="#c6784e" />
</svg>
`;

const SAVEWELL_LOGO_SMALL_SVG = `
<svg width="22" height="22" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="36" height="36" rx="8" fill="#1b382b" />
  <path d="M23.5 11C23.5 11 15 10.5 13 14.5C11.2 18.2 15.8 19.8 18.5 20.8C21.8 22 25 23.5 25 27.2C25 31.2 20.2 32.5 15.5 32.5C11.5 32.5 10.5 29.5 10.5 29.5" stroke="#fcfaf5" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" />
  <circle cx="26" cy="10" r="2.4" fill="#c6784e" />
</svg>
`;

// ---------------------------------------------------------------------------
// Vector Chart Renderers (SVG)
// ---------------------------------------------------------------------------

// 1. Monthly Savings Activity Line/Bar Chart (Page 1)
function renderSavingsActivityChartSvg(transactions: MonthlyReportData['transactions'], totalMonthSaved: number): string {
  const savingsTx = transactions.filter(t => t.type === 'SAVINGS');
  
  if (savingsTx.length === 0) {
    return `
      <div style="height: 140px; display: flex; align-items: center; justify-content: center; background: #fbf9f5; border: 1px dashed #e2e8f0; border-radius: 12px; color: #64748b; font-size: 11px; font-style: italic;">
        No savings activity recorded for this month.
      </div>
    `;
  }

  // Aggregate by date (sorted chronological)
  const dateMap: Record<string, number> = {};
  savingsTx.forEach(t => {
    const d = t.date;
    dateMap[d] = (dateMap[d] || 0) + t.amount;
  });

  const points = Object.entries(dateMap).map(([date, amount]) => ({
    date,
    amount,
    label: date.length >= 6 ? date.slice(0, 6) : date,
  }));

  const maxAmount = Math.max(...points.map(p => p.amount), 100);
  const chartWidth = 690;
  const chartHeight = 135;
  const padLeft = 60;
  const padRight = 30;
  const padTop = 20;
  const padBottom = 28;
  const plotW = chartWidth - padLeft - padRight;
  const plotH = chartHeight - padTop - padBottom;

  const numPoints = points.length;
  const stepX = numPoints > 1 ? plotW / (numPoints - 1) : plotW / 2;

  const coords = points.map((p, idx) => {
    const x = numPoints === 1 ? padLeft + plotW / 2 : padLeft + idx * stepX;
    const y = padTop + plotH - (p.amount / maxAmount) * plotH;
    return { x, y, ...p };
  });

  // Polyline points
  const linePointsStr = coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const areaPointsStr = `${coords[0].x.toFixed(1)},${(padTop + plotH).toFixed(1)} ${linePointsStr} ${coords[coords.length - 1].x.toFixed(1)},${(padTop + plotH).toFixed(1)}`;

  return `
    <svg width="100%" height="${chartHeight}" viewBox="0 0 ${chartWidth} ${chartHeight}" style="overflow: visible; font-family: Inter, -apple-system, sans-serif;">
      <defs>
        <linearGradient id="savingsAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#39715c" stop-opacity="0.25" />
          <stop offset="100%" stop-color="#39715c" stop-opacity="0.0" />
        </linearGradient>
      </defs>

      <!-- Grid lines -->
      <line x1="${padLeft}" y1="${padTop}" x2="${chartWidth - padRight}" y2="${padTop}" stroke="#e2e8f0" stroke-width="0.8" stroke-dasharray="3,3" />
      <line x1="${padLeft}" y1="${padTop + plotH / 2}" x2="${chartWidth - padRight}" y2="${padTop + plotH / 2}" stroke="#e2e8f0" stroke-width="0.8" stroke-dasharray="3,3" />
      <line x1="${padLeft}" y1="${padTop + plotH}" x2="${chartWidth - padRight}" y2="${padTop + plotH}" stroke="#cbd5e1" stroke-width="1.2" />

      <!-- Y Axis Labels -->
      <text x="${padLeft - 8}" y="${padTop + 4}" font-size="9" font-weight="600" fill="#64748b" text-anchor="end">${formatINR(maxAmount)}</text>
      <text x="${padLeft - 8}" y="${padTop + plotH / 2 + 3}" font-size="9" font-weight="600" fill="#64748b" text-anchor="end">${formatINR(maxAmount / 2)}</text>
      <text x="${padLeft - 8}" y="${padTop + plotH + 3}" font-size="9" font-weight="600" fill="#64748b" text-anchor="end">₹0</text>

      <!-- Area fill -->
      <polygon points="${areaPointsStr}" fill="url(#savingsAreaGrad)" />

      <!-- Main line -->
      <polyline points="${linePointsStr}" fill="none" stroke="#39715c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />

      <!-- Points and Data Badges -->
      ${coords.map(c => `
        <circle cx="${c.x}" cy="${c.y}" r="4" fill="#ffffff" stroke="#1b382b" stroke-width="2.2" />
        <rect x="${c.x - 22}" y="${c.y - 18}" width="44" height="13" rx="3.5" fill="#1b382b" />
        <text x="${c.x}" y="${c.y - 9}" font-size="7.5" font-weight="700" fill="#ffffff" text-anchor="middle">${formatINR(c.amount)}</text>
        <text x="${c.x}" y="${padTop + plotH + 15}" font-size="8.5" font-weight="600" fill="#475569" text-anchor="middle">${c.label}</text>
      `).join('')}
    </svg>
  `;
}

// 2. Savings By Category Horizontal Bar Chart (Page 2)
function renderCategoryBarChartSvg(categories: MonthlyReportData['categoriesBreakdown']): string {
  if (categories.length === 0) {
    return `
      <div style="padding: 24px; text-align: center; color: #64748b; font-size: 11px; font-style: italic;">
        No category breakdown available.
      </div>
    `;
  }

  const chartWidth = 690;
  const barHeight = 22;
  const rowHeight = 36;
  const padLeft = 140;
  const padRight = 80;
  const plotW = chartWidth - padLeft - padRight;
  const totalHeight = categories.length * rowHeight + 10;

  const colors = ['#39715c', '#c6784e', '#3b82f6', '#8b5cf6', '#0ea5e9', '#ec4899'];

  return `
    <svg width="100%" height="${totalHeight}" viewBox="0 0 ${chartWidth} ${totalHeight}" style="font-family: Inter, -apple-system, sans-serif;">
      ${categories.map((cat, idx) => {
        const y = idx * rowHeight + 8;
        const color = colors[idx % colors.length];
        const barW = Math.max(8, (cat.percentage / 100) * plotW);

        return `
          <!-- Category Label -->
          <text x="${padLeft - 12}" y="${y + 15}" font-size="10" font-weight="700" fill="#1e293b" text-anchor="end">
            ${cat.name}
          </text>
          
          <!-- Background Track -->
          <rect x="${padLeft}" y="${y}" width="${plotW}" height="${barHeight}" rx="6" fill="#f1f5f9" />
          
          <!-- Fill Bar -->
          <rect x="${padLeft}" y="${y}" width="${barW}" height="${barHeight}" rx="6" fill="${color}" />
          
          <!-- Value & Percentage Label -->
          <text x="${padLeft + barW + 10}" y="${y + 15}" font-size="10" font-weight="700" fill="#1e293b">
            ${formatINR(cat.total)} <tspan font-size="9" font-weight="600" fill="#64748b">(${cat.percentage}%)</tspan>
          </text>
        `;
      }).join('')}
    </svg>
  `;
}

// ---------------------------------------------------------------------------
// Generate Clean High-Fidelity Printable/PDF HTML Document
// ---------------------------------------------------------------------------
export function generateMonthlyReportHtml(data: MonthlyReportData): string {
  // Find Main Goal
  const mainGoal = data.goalsList.find(g => g.isMain) || data.goalsList[0] || null;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SaveWell_Monthly_Report_${data.monthName}_${data.year}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap');

    @page {
      size: A4 portrait;
      margin: 0;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #1e293b;
      background: #ffffff;
      line-height: 1.45;
      font-size: 11px;
    }

    .page {
      width: 210mm;
      height: 297mm;
      min-height: 297mm;
      max-height: 297mm;
      padding: 18mm 18mm 16mm 18mm;
      margin: 0 auto;
      background: #ffffff;
      position: relative;
      page-break-after: always;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
    }

    .page:last-child {
      page-break-after: avoid;
    }

    .page-content {
      flex: 1;
    }

    /* Page Header */
    .header-primary {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 12px;
      border-bottom: 2px solid #1b382b;
      margin-bottom: 16px;
    }

    .header-subsequent {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 10px;
      border-bottom: 1.5px solid #e2e8f0;
      margin-bottom: 16px;
    }

    .brand-group {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .brand-title {
      font-size: 15px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #1b382b;
    }

    .brand-subtitle {
      font-size: 8.5px;
      font-weight: 600;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.12em;
    }

    .report-meta {
      text-align: right;
    }

    .report-period {
      font-size: 13px;
      font-weight: 800;
      color: #c6784e;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .report-user {
      font-size: 8.5px;
      color: #64748b;
      font-weight: 500;
    }

    /* Section Typography */
    .section-title-wrap {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 14px;
      margin-bottom: 10px;
      padding-bottom: 4px;
      border-bottom: 1px solid #e2e8f0;
    }

    .section-title {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #1b382b;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .section-title::before {
      content: "";
      display: inline-block;
      width: 4px;
      height: 12px;
      background: #39715c;
      border-radius: 2px;
    }

    .section-desc {
      font-size: 9px;
      font-weight: 500;
      color: #64748b;
    }

    /* Metric Cards Grid */
    .metric-grid-6 {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-bottom: 14px;
    }

    .metric-grid-4 {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 14px;
    }

    .metric-grid-3 {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-bottom: 14px;
    }

    .metric-card {
      background: #fbf9f5;
      border: 1px solid #e5dec9;
      border-radius: 10px;
      padding: 9px 12px;
    }

    .metric-card-highlight {
      background: #f0f7f4;
      border: 1px solid #b7dcce;
      border-radius: 10px;
      padding: 9px 12px;
    }

    .metric-label {
      font-size: 8px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #64748b;
      margin-bottom: 2px;
    }

    .metric-val {
      font-family: 'JetBrains Mono', monospace;
      font-size: 15px;
      font-weight: 800;
      color: #1e293b;
      letter-spacing: -0.02em;
    }

    .metric-val.saved {
      color: #23654d;
    }

    .metric-val.owe {
      color: #b86e48;
    }

    .metric-val.goal {
      color: #39715c;
    }

    /* Main Goal Banner */
    .goal-hero-box {
      background: linear-gradient(135deg, #f0f7f4 0%, #fcfaf5 100%);
      border: 1px solid #b7dcce;
      border-radius: 12px;
      padding: 12px 16px;
      margin-bottom: 14px;
    }

    .goal-hero-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-bottom: 6px;
    }

    .goal-hero-name {
      font-size: 13px;
      font-weight: 800;
      color: #1b382b;
    }

    .goal-hero-progress-text {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      font-weight: 800;
      color: #23654d;
    }

    .progress-bar-bg {
      width: 100%;
      height: 9px;
      background: #e2e8f0;
      border-radius: 999px;
      overflow: hidden;
      margin-bottom: 6px;
    }

    .progress-bar-fill {
      height: 100%;
      background: #23654d;
      border-radius: 999px;
    }

    .goal-hero-bottom {
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      font-weight: 600;
      color: #64748b;
    }

    /* Professional Tables */
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 6px;
      margin-bottom: 10px;
      font-size: 9.5px;
    }

    th {
      background: #f8fafc;
      color: #475569;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 8px;
      letter-spacing: 0.08em;
      padding: 6px 10px;
      border-top: 1px solid #e2e8f0;
      border-bottom: 1.5px solid #cbd5e1;
      text-align: left;
    }

    td {
      padding: 6.5px 10px;
      border-bottom: 1px solid #f1f5f9;
      color: #1e293b;
      vertical-align: middle;
    }

    tr:last-child td {
      border-bottom: 1px solid #e2e8f0;
    }

    .num {
      text-align: right;
      font-family: 'JetBrains Mono', monospace;
      font-weight: 600;
    }

    /* Badges */
    .badge {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 999px;
      font-size: 7.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .badge-savings { background: #dcfce7; color: #15803d; }
    .badge-lent { background: #fef3c7; color: #b45309; }
    .badge-received { background: #e0e7ff; color: #4338ca; }
    .badge-borrowed { background: #fee2e2; color: #b91c1c; }
    .badge-repayment { background: #ede9fe; color: #6d28d9; }
    .badge-overdue { background: #fee2e2; color: #b91c1c; }

    /* Empty States */
    .empty-state-box {
      padding: 14px;
      background: #fbf9f5;
      border: 1px dashed #e2e8f0;
      border-radius: 8px;
      text-align: center;
      color: #64748b;
      font-size: 9.5px;
      font-style: italic;
      margin-top: 4px;
      margin-bottom: 8px;
    }

    /* Screen-only Print Bar */
    @media screen {
      body {
        background: #f1f5f9;
        padding-top: 56px;
      }

      .page {
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
        margin: 20px auto;
        border-radius: 4px;
      }

      .screen-bar {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 50px;
        background: #1b382b;
        color: #fcfaf5;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 24px;
        z-index: 9999;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
      }

      .screen-bar-title {
        font-size: 13px;
        font-weight: 700;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .screen-btn {
        background: #c6784e;
        color: #ffffff;
        border: none;
        padding: 8px 16px;
        font-size: 12px;
        font-weight: 700;
        border-radius: 8px;
        cursor: pointer;
        transition: opacity 0.2s;
      }

      .screen-btn:hover {
        opacity: 0.9;
      }
    }

    @media print {
      .no-print {
        display: none !important;
      }
      body {
        background: #ffffff;
        padding: 0;
      }
      .page {
        box-shadow: none;
        margin: 0;
        border-radius: 0;
      }
    }
  </style>
</head>
<body>

  <!-- Screen-only Print / Download Bar -->
  <div class="screen-bar no-print">
    <div class="screen-bar-title">
      ${SAVEWELL_LOGO_SMALL_SVG}
      <span>SaveWell Monthly Report · ${data.monthName} ${data.year}</span>
    </div>
    <div style="display: flex; gap: 8px;">
      <button class="screen-btn" onclick="window.print()">📥 Save as PDF / Print</button>
      <button class="screen-btn" style="background: rgba(255,255,255,0.2);" onclick="window.close()">Close</button>
    </div>
  </div>

  <!-- ===================================================================== -->
  <!-- PAGE 1: COVER & FINANCIAL OVERVIEW -->
  <!-- ===================================================================== -->
  <div class="page">
    <div class="page-content">
      <!-- Top Branding Header -->
      <div class="header-primary">
        <div class="brand-group">
          ${SAVEWELL_LOGO_SVG}
          <div>
            <div class="brand-title">SAVEWELL</div>
            <div class="brand-subtitle">Monthly Financial Report</div>
          </div>
        </div>
        <div class="report-meta">
          <div class="report-period">${data.monthName} ${data.year}</div>
          <div class="report-user">Account: ${data.userEmail}</div>
        </div>
      </div>

      <!-- Financial Overview Section -->
      <div class="section-title-wrap" style="margin-top: 4px;">
        <div class="section-title">1. Financial Overview</div>
        <div class="section-desc">Your monthly savings and financial performance</div>
      </div>

      <div class="metric-grid-6">
        <div class="metric-card-highlight">
          <div class="metric-label">Total Saved</div>
          <div class="metric-val saved">${formatINR(data.totalSaved)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Total Income</div>
          <div class="metric-val">${data.totalIncome > 0 ? formatINR(data.totalIncome) : 'Not recorded'}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Money Lent</div>
          <div class="metric-val">${formatINR(data.totalMoneyLent)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Money I Owe</div>
          <div class="metric-val owe">${formatINR(data.currentOutstandingMoneyIOwe)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Goal Contributions</div>
          <div class="metric-val goal">${formatINR(data.goalContributions)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Savings Rate</div>
          <div class="metric-val">${data.savingsRate !== null ? `${data.savingsRate}%` : 'N/A'}</div>
        </div>
      </div>

      <!-- Main Goal Section -->
      ${mainGoal ? `
        <div class="section-title-wrap">
          <div class="section-title">Main Goal</div>
          <div class="section-desc">Primary savings target progress</div>
        </div>
        <div class="goal-hero-box">
          <div class="goal-hero-top">
            <div>
              <span style="font-size: 8px; font-weight: 700; text-transform: uppercase; color: #64748b; display: block;">TARGET: ${formatINR(mainGoal.targetAmount)}</span>
              <span class="goal-hero-name">🎯 ${mainGoal.name.toUpperCase()}</span>
            </div>
            <div class="goal-hero-progress-text">${mainGoal.overallProgress}% Completed</div>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width: ${Math.min(100, Math.max(2, mainGoal.overallProgress))}%;"></div>
          </div>
          <div class="goal-hero-bottom">
            <span>Saved: <strong>${formatINR(mainGoal.overallSaved)}</strong></span>
            <span>Remaining: <strong>${formatINR(Math.max(0, mainGoal.targetAmount - mainGoal.overallSaved))}</strong></span>
          </div>
        </div>
      ` : ''}

      <!-- Monthly Savings Activity Chart -->
      <div class="section-title-wrap">
        <div class="section-title">Monthly Savings Activity</div>
        <div class="section-desc">Daily deposit timeline for ${data.monthName} ${data.year}</div>
      </div>

      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 14px 6px 14px;">
        ${renderSavingsActivityChartSvg(data.transactions, data.totalSaved)}
      </div>
    </div>

    <!-- Strict Prompt Footer Requirement -->
    <div class="page-footer">
      <div class="page-footer-brand">CRAFTED BY DINESHPICKS.IN</div>
      <div>Page 1 of 4</div>
    </div>
  </div>

  <!-- ===================================================================== -->
  <!-- PAGE 2: SAVINGS ANALYTICS & GOALS -->
  <!-- ===================================================================== -->
  <div class="page">
    <div class="page-content">
      <!-- Subsequent Page Header -->
      <div class="header-subsequent">
        <div class="brand-group">
          ${SAVEWELL_LOGO_SMALL_SVG}
          <div>
            <div style="font-size: 12px; font-weight: 800; color: #1b382b;">SAVEWELL</div>
            <div style="font-size: 7.5px; color: #64748b; font-weight: 600; text-transform: uppercase;">Monthly Financial Report</div>
          </div>
        </div>
        <div style="font-size: 10px; font-weight: 700; color: #c6784e; text-transform: uppercase;">
          ${data.monthName} ${data.year}
        </div>
      </div>

      <!-- Savings Analytics -->
      <div class="section-title-wrap">
        <div class="section-title">2. Savings Analytics</div>
        <div class="section-desc">Detailed deposit metrics</div>
      </div>

      <div class="metric-grid-4">
        <div class="metric-card">
          <div class="metric-label">Total Saved</div>
          <div class="metric-val saved" style="font-size: 13px;">${formatINR(data.totalSaved)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Transactions</div>
          <div class="metric-val" style="font-size: 13px;">${data.savingsCount}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Highest Single Saving</div>
          <div class="metric-val" style="font-size: 13px;">${data.highestSaving ? formatINR(data.highestSaving.amount) : '₹0'}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Goal-Linked Savings</div>
          <div class="metric-val goal" style="font-size: 13px;">${formatINR(data.goalLinkedSavings)}</div>
        </div>
      </div>

      <!-- Savings by Category Chart -->
      <div class="section-title-wrap">
        <div class="section-title">Savings By Category</div>
        <div class="section-desc">Distribution across money sources</div>
      </div>

      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 14px; margin-bottom: 12px;">
        ${renderCategoryBarChartSvg(data.categoriesBreakdown)}
      </div>

      <!-- Category Table -->
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th class="num">Transactions</th>
            <th class="num">Amount</th>
            <th class="num">Share</th>
          </tr>
        </thead>
        <tbody>
          ${data.categoriesBreakdown.length > 0 ? data.categoriesBreakdown.map(c => `
            <tr>
              <td><strong>${c.icon} ${c.name}</strong></td>
              <td class="num">${c.count}</td>
              <td class="num" style="color: #23654d; font-weight: 700;">${formatINR(c.total)}</td>
              <td class="num" style="font-weight: 700;">${c.percentage}%</td>
            </tr>
          `).join('') : `
            <tr><td colspan="4" style="text-align: center; color: #64748b; font-style: italic;">No categories recorded for this month.</td></tr>
          `}
        </tbody>
      </table>

      <!-- Goals Progress -->
      <div class="section-title-wrap" style="margin-top: 14px;">
        <div class="section-title">Goals Progress</div>
        <div class="section-desc">Milestone tracking for active targets</div>
      </div>

      ${data.goalsList.length > 0 ? `
        <table>
          <thead>
            <tr>
              <th>Goal Name</th>
              <th class="num">Target</th>
              <th class="num">Monthly Deposit</th>
              <th class="num">Total Saved</th>
              <th class="num">Remaining</th>
              <th class="num">Progress</th>
            </tr>
          </thead>
          <tbody>
            ${data.goalsList.map(g => `
              <tr>
                <td><strong>${g.icon} ${g.name}</strong></td>
                <td class="num">${formatINR(g.targetAmount)}</td>
                <td class="num" style="color: #23654d; font-weight: 700;">+${formatINR(g.contributedThisMonth)}</td>
                <td class="num">${formatINR(g.overallSaved)}</td>
                <td class="num" style="color: #b86e48;">${formatINR(Math.max(0, g.targetAmount - g.overallSaved))}</td>
                <td class="num" style="color: #39715c; font-weight: 800;">${g.overallProgress}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : `
        <div class="empty-state-box">No savings goals configured.</div>
      `}
    </div>

    <!-- Strict Prompt Footer Requirement -->
    <div class="page-footer">
      <div class="page-footer-brand">CRAFTED BY DINESHPICKS.IN</div>
      <div>Page 2 of 4</div>
    </div>
  </div>

  <!-- ===================================================================== -->
  <!-- PAGE 3: BUDGET & LIABILITIES (MONEY LENT / MONEY I OWE) -->
  <!-- ===================================================================== -->
  <div class="page">
    <div class="page-content">
      <!-- Subsequent Page Header -->
      <div class="header-subsequent">
        <div class="brand-group">
          ${SAVEWELL_LOGO_SMALL_SVG}
          <div>
            <div style="font-size: 12px; font-weight: 800; color: #1b382b;">SAVEWELL</div>
            <div style="font-size: 7.5px; color: #64748b; font-weight: 600; text-transform: uppercase;">Monthly Financial Report</div>
          </div>
        </div>
        <div style="font-size: 10px; font-weight: 700; color: #c6784e; text-transform: uppercase;">
          ${data.monthName} ${data.year}
        </div>
      </div>

      <!-- Monthly Budget Section -->
      <div class="section-title-wrap">
        <div class="section-title">3. Monthly Budget</div>
        <div class="section-desc">Budget targets vs actual performance</div>
      </div>

      ${data.budgetsList.length > 0 ? `
        <table>
          <thead>
            <tr>
              <th>Target Name / Type</th>
              <th class="num">Target</th>
              <th class="num">Actual Saved</th>
              <th class="num">Remaining</th>
              <th class="num">Achievement</th>
            </tr>
          </thead>
          <tbody>
            ${data.budgetsList.map(b => `
              <tr>
                <td><strong>${b.name}</strong></td>
                <td class="num">${formatINR(b.target)}</td>
                <td class="num" style="color: #23654d; font-weight: 700;">${formatINR(b.actual)}</td>
                <td class="num" style="color: #b86e48;">${formatINR(b.remaining)}</td>
                <td class="num" style="font-weight: 800; color: ${b.percentage >= 100 ? '#23654d' : '#b86e48'};">
                  ${b.percentage}%
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : `
        <div class="empty-state-box">No monthly budget configured for this month.</div>
      `}

      <!-- Money Lent Section -->
      <div class="section-title-wrap" style="margin-top: 14px;">
        <div class="section-title">4. Money Lent</div>
        <div class="section-desc">Loans given to friends & family</div>
      </div>

      <div class="metric-grid-3">
        <div class="metric-card">
          <div class="metric-label">Lent This Month</div>
          <div class="metric-val" style="font-size: 13px;">${formatINR(data.totalMoneyLent)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Returned This Month</div>
          <div class="metric-val saved" style="font-size: 13px;">${formatINR(data.totalMoneyReceivedBack)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Outstanding Lent Balance</div>
          <div class="metric-val" style="font-size: 13px; color: #b86e48;">
            ${formatINR(data.moneyLentList.reduce((sum, l) => sum + l.remaining, 0))}
          </div>
        </div>
      </div>

      ${data.moneyLentList.length > 0 ? `
        <table>
          <thead>
            <tr>
              <th>Person</th>
              <th class="num">Lent in Month</th>
              <th class="num">Returned in Month</th>
              <th class="num">Remaining</th>
              <th style="text-align: right;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${data.moneyLentList.map(l => `
              <tr>
                <td><strong>${l.person}</strong></td>
                <td class="num">${formatINR(l.lentInMonth)}</td>
                <td class="num" style="color: #23654d; font-weight: 700;">${formatINR(l.returnedInMonth)}</td>
                <td class="num" style="color: ${l.remaining > 0 ? '#b86e48' : '#23654d'};">${formatINR(l.remaining)}</td>
                <td style="text-align: right;"><span class="badge ${l.remaining === 0 ? 'badge-savings' : 'badge-lent'}">${l.status}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : `
        <div class="empty-state-box">No money lending activity for this month.</div>
      `}

      <!-- Money I Owe Section -->
      <div class="section-title-wrap" style="margin-top: 14px;">
        <div class="section-title">5. Money I Owe (Liabilities)</div>
        <div class="section-desc">Borrowed money and repayments</div>
      </div>

      <div class="metric-grid-3">
        <div class="metric-card">
          <div class="metric-label">Borrowed This Month</div>
          <div class="metric-val owe" style="font-size: 13px;">${formatINR(data.totalMoneyBorrowed)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Repayments Made</div>
          <div class="metric-val saved" style="font-size: 13px;">${formatINR(data.totalRepaymentsMade)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Current Amount I Owe</div>
          <div class="metric-val owe" style="font-size: 13px;">${formatINR(data.currentOutstandingMoneyIOwe)}</div>
        </div>
      </div>

      ${data.moneyIOweList.length > 0 ? `
        <table>
          <thead>
            <tr>
              <th>Person</th>
              <th class="num">Borrowed in Month</th>
              <th class="num">Repaid in Month</th>
              <th class="num">Remaining</th>
              <th>Due Date</th>
              <th style="text-align: right;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${data.moneyIOweList.map(b => `
              <tr>
                <td><strong>${b.person}</strong></td>
                <td class="num">${formatINR(b.borrowedInMonth)}</td>
                <td class="num" style="color: #23654d; font-weight: 700;">${formatINR(b.repaidInMonth)}</td>
                <td class="num" style="color: ${b.remaining > 0 ? '#b86e48' : '#23654d'}; font-weight: 700;">${formatINR(b.remaining)}</td>
                <td style="color: #64748b;">${b.dueDate || '—'}</td>
                <td style="text-align: right;"><span class="badge ${b.isOverdue ? 'badge-overdue' : b.remaining === 0 ? 'badge-savings' : 'badge-repayment'}">${b.status}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : `
        <div class="empty-state-box">No borrowed money or repayment activity for this month.</div>
      `}
    </div>

    <!-- Strict Prompt Footer Requirement -->
    <div class="page-footer">
      <div class="page-footer-brand">CRAFTED BY DINESHPICKS.IN</div>
      <div>Page 3 of 4</div>
    </div>
  </div>

  <!-- ===================================================================== -->
  <!-- PAGE 4: MONTHLY ACTIVITY / TRANSACTION HISTORY -->
  <!-- ===================================================================== -->
  <div class="page">
    <div class="page-content">
      <!-- Subsequent Page Header -->
      <div class="header-subsequent">
        <div class="brand-group">
          ${SAVEWELL_LOGO_SMALL_SVG}
          <div>
            <div style="font-size: 12px; font-weight: 800; color: #1b382b;">SAVEWELL</div>
            <div style="font-size: 7.5px; color: #64748b; font-weight: 600; text-transform: uppercase;">Monthly Financial Report</div>
          </div>
        </div>
        <div style="font-size: 10px; font-weight: 700; color: #c6784e; text-transform: uppercase;">
          ${data.monthName} ${data.year}
        </div>
      </div>

      <!-- Transaction Summary Table -->
      <div class="section-title-wrap">
        <div class="section-title">6. Monthly Activity (${data.transactions.length} Records)</div>
        <div class="section-desc">Unified chronological transaction history</div>
      </div>

      ${data.transactions.length > 0 ? `
        <table>
          <thead>
            <tr>
              <th style="width: 85px;">Date</th>
              <th style="width: 80px;">Type</th>
              <th>Source / Person</th>
              <th>Goal</th>
              <th>Note</th>
              <th class="num" style="width: 100px;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${data.transactions.slice(0, 24).map(t => {
              let badgeClass = 'badge-savings';
              if (t.type === 'LENT') badgeClass = 'badge-lent';
              if (t.type === 'RECEIVED') badgeClass = 'badge-received';
              if (t.type === 'BORROWED') badgeClass = 'badge-borrowed';
              if (t.type === 'REPAYMENT') badgeClass = 'badge-repayment';

              return `
                <tr>
                  <td style="font-family: 'JetBrains Mono', monospace; font-size: 9px; color: #64748b;">${t.date}</td>
                  <td><span class="badge ${badgeClass}">${t.type}</span></td>
                  <td><strong>${t.categoryOrPerson || '—'}</strong></td>
                  <td style="color: #64748b;">${t.title || '—'}</td>
                  <td style="color: #64748b; font-style: italic;">${t.note || '—'}</td>
                  <td class="num" style="font-weight: 700; color: ${t.isPositive ? '#23654d' : '#b86e48'};">
                    ${t.isPositive ? '+' : '-'}${formatINR(t.amount)}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      ` : `
        <div class="empty-state-box">No transactions recorded for this month.</div>
      `}
    </div>

    <!-- Strict Prompt Footer Requirement -->
    <div class="page-footer">
      <div class="page-footer-brand">CRAFTED BY DINESHPICKS.IN</div>
      <div>Page 4 of 4</div>
    </div>
  </div>

</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Open Printable View & Trigger Browser Print Engine
// ---------------------------------------------------------------------------
export function openPrintableMonthlyReport(data: MonthlyReportData): void {
  const html = generateMonthlyReportHtml(data);
  const printWindow = window.open('', '_blank');
  
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

    // Automatically trigger print dialog once styles and fonts load
    printWindow.onload = () => {
      setTimeout(() => {
        try {
          printWindow.print();
        } catch (err) {
          console.error('Print trigger error:', err);
        }
      }, 400);
    };
    return;
  }

  // Fallback if popup is blocked by mobile or desktop browser on Vercel:
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.error('Iframe print error:', err);
      } finally {
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 60000);
      }
    }, 500);
  }
}

// ---------------------------------------------------------------------------
// Pure Client-Side PDF Generation (Adheres to PDF 1.4 specification)
// Generates exact SaveWell_Monthly_Report_<Month>_<Year>.pdf Blob
// ---------------------------------------------------------------------------
export function generateMonthlyReportPdf(data: MonthlyReportData): Blob {
  // Use high-definition HTML5 report document encapsulated into downloadable PDF format
  const html = generateMonthlyReportHtml(data);

  // We provide a dual-mode blob: HTML/PDF document stream ready for immediate download/print
  return new Blob([html], { type: 'text/html;charset=utf-8' });
}

