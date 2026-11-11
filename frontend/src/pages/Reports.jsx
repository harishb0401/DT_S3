import React, { useState, useEffect } from 'react';
import { DatePicker, Button, Space, message, Tag } from 'antd';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, Area, AreaChart,
} from 'recharts';
import {
  BarChartOutlined,
  CalendarOutlined,
  SearchOutlined,
  DownloadOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
} from '@ant-design/icons';
import api from '../api/client';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 10,
      padding: '10px 14px',
      boxShadow: 'var(--shadow-md)',
      fontSize: 13,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--color-text-primary)' }}>{label}</div>
      {payload.map((entry, i) => (
        <div key={i} style={{ color: entry.color, fontWeight: 500 }}>
          {entry.name}: <strong>{entry.value}</strong>
        </div>
      ))}
    </div>
  );
};

const Reports = () => {
  const [date, setDate] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [feeSummary, setFeeSummary] = useState(null);
  const [downloadingFormat, setDownloadingFormat] = useState(null);

  useEffect(() => {
    fetchFeeSummary();
  }, []);

  const fetchFeeSummary = async () => {
    try {
      const res = await api.get('/reports/fee-report/summary');
      setFeeSummary(res.data);
    } catch (e) {
      console.error('Failed to load fee summary:', e);
    }
  };

  const handleDownloadFeeReport = async (format) => {
    setDownloadingFormat(format);
    try {
      const res = await api.get(`/reports/fee-report/download?format=${format}`, {
        responseType: 'blob',
      });
      const ext = format === 'pdf' ? 'pdf' : 'xlsx';
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `Kongu_Bus_Fee_Report_${new Date().toISOString().slice(0, 10)}.${ext}`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      message.success(`Fee report (${ext.toUpperCase()}) downloaded successfully`);
    } catch (e) {
      message.error(`Failed to download ${format.toUpperCase()} report`);
    }
    setDownloadingFormat(null);
  };

  const generateReport = async () => {
    if (!date) return;
    setLoading(true);
    try {
      const res = await api.get(`/reports/daily?date=${date.format('YYYY-MM-DD')}`);
      setReport(res.data);
    } catch (e) {
      console.error('Failed to generate report:', e);
    }
    setLoading(false);
  };

  const chartData = report
    ? [{ day: 'Mon', total: 120 }, { day: 'Tue', total: 150 }]
    : [];

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1>Reports & Analytics</h1>
          <p className="page-subtitle">Daily travel compliance and fee collection summaries</p>
        </div>
      </div>

      {/* Comprehensive Fee Report Download Card */}
      <div className="premium-card animate-fade-in-up" style={{ padding: '24px', marginBottom: 20, background: 'linear-gradient(135deg, #f8fafc, #eff6ff)', border: '1px solid #bfdbfe' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, background: '#1d4ed8', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <DownloadOutlined style={{ color: '#fff', fontSize: 18 }} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#1e3a8a' }}>
                  Student Bus Fee Payment Report
                </h3>
                <p style={{ margin: 0, fontSize: 12, color: '#475569' }}>
                  Official comprehensive report separating Paid and Not Paid / Pending students with full institutional details
                </p>
              </div>
            </div>

            {feeSummary && (
              <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
                <Tag color="blue" style={{ fontSize: 12, padding: '2px 8px' }}>Total Students: <strong>{feeSummary.totalStudents}</strong></Tag>
                <Tag color="green" style={{ fontSize: 12, padding: '2px 8px' }}>Paid: <strong>{feeSummary.paidCount}</strong> (₹{feeSummary.totalFeeCollected.toLocaleString('en-IN')})</Tag>
                <Tag color="red" style={{ fontSize: 12, padding: '2px 8px' }}>Not Paid: <strong>{feeSummary.unpaidCount}</strong> (₹{feeSummary.outstandingFeeAmount.toLocaleString('en-IN')})</Tag>
              </div>
            )}
          </div>

          <Space size={12} wrap>
            <Button
              type="primary"
              icon={<FileExcelOutlined />}
              size="large"
              loading={downloadingFormat === 'xlsx'}
              onClick={() => handleDownloadFeeReport('xlsx')}
              style={{
                borderRadius: 10,
                fontWeight: 600,
                background: '#047857',
                borderColor: '#047857',
              }}
            >
              Download Excel (.xlsx)
            </Button>
            <Button
              type="primary"
              danger
              icon={<FilePdfOutlined />}
              size="large"
              loading={downloadingFormat === 'pdf'}
              onClick={() => handleDownloadFeeReport('pdf')}
              style={{
                borderRadius: 10,
                fontWeight: 600,
              }}
            >
              Download PDF (.pdf)
            </Button>
          </Space>
        </div>
      </div>

      {/* Date Selection Card */}
      <div className="premium-card animate-fade-in-up delay-1" style={{ padding: '20px 24px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <CalendarOutlined style={{ color: 'var(--color-primary)', fontSize: 16 }} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>Select Report Date</span>
        </div>
        <Space wrap>
          <DatePicker
            onChange={setDate}
            style={{ width: 200, borderRadius: 10 }}
            placeholder="Pick a date"
            id="report-date-picker"
          />
          <Button
            type="primary"
            icon={<SearchOutlined />}
            onClick={generateReport}
            loading={loading}
            disabled={!date}
            id="generate-report-btn"
            style={{ borderRadius: 10, fontWeight: 600 }}
          >
            Generate Report
          </Button>
        </Space>
      </div>

      {/* Report Results */}
      {report && (
        <div className="animate-fade-in-up">
          {/* KPI Row */}
          <div className="report-kpi-row">
            <div className="report-kpi-block delay-1">
              <div className="report-kpi-value" style={{ color: 'var(--color-primary)' }}>
                {report.total ?? '—'}
              </div>
              <div className="report-kpi-label">Total Travels</div>
            </div>
            <div className="report-kpi-block delay-2">
              <div className="report-kpi-value" style={{ color: 'var(--color-danger)' }}>
                {report.unpaid ?? '—'}
              </div>
              <div className="report-kpi-label">Unpaid Trips</div>
            </div>
            <div className="report-kpi-block delay-3">
              <div className="report-kpi-value" style={{ color: 'var(--color-success)' }}>
                {report.compliance != null ? `${report.compliance}%` : '—'}
              </div>
              <div className="report-kpi-label">Compliance Rate</div>
            </div>
          </div>

          {/* Chart */}
          <div className="premium-card animate-fade-in-up delay-3" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <BarChartOutlined style={{ color: 'var(--color-primary)', fontSize: 16 }} />
              <span style={{ fontWeight: 700, fontSize: 14 }}>Weekly Travel Trend</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
                Placeholder data — connect analytics API for live chart
              </span>
            </div>
            <div style={{ padding: '24px 12px 12px' }}>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: 13, paddingTop: 16 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    name="Total Travels"
                    stroke="#6366f1"
                    strokeWidth={2.5}
                    fill="url(#gradTotal)"
                    dot={{ fill: '#6366f1', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Empty State when no date selected */}
      {!report && !loading && (
        <div className="premium-card animate-fade-in-up delay-2" style={{ padding: 0 }}>
          <div className="empty-state" style={{ padding: '64px 24px' }}>
            <div className="empty-state-icon">📊</div>
            <div className="empty-state-text">Select a date and click "Generate Report" to view analytics</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;