import React, { useEffect, useState } from 'react';
import { Table, Tag, Avatar, Tooltip, Button, Modal, Space, message, Spin } from 'antd';
import {
  TeamOutlined,
  CarOutlined,
  RiseOutlined,
  WarningOutlined,
  ClockCircleOutlined,
  DownloadOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { useWebSocket } from '../hooks/useWebSocket';
import { travelStore } from '../stores/travelStore';
import api from '../api/client';

const KpiCard = ({ icon, iconBg, value, label, trend, trendLabel, delay, isPulsing }) => (
  <div className={`kpi-card card-hover animate-fade-in-up delay-${delay}`}>
    <div className="kpi-icon" style={{ background: iconBg }} aria-hidden="true">
      {icon}
    </div>
    <div className="kpi-value" style={isPulsing ? { color: '#ef4444' } : undefined}>
      {value ?? '—'}
    </div>
    <div className="kpi-label">{label}</div>
    {trendLabel && (
      <div className="kpi-trend" style={{ color: 'var(--color-text-muted)' }}>
        {trendLabel}
      </div>
    )}
    {isPulsing && (
      <span
        aria-label="Requires attention"
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: '#ef4444',
          display: 'inline-block',
          animation: 'pulse-ring 2s ease infinite',
        }}
      />
    )}
  </div>
);

const StatusBadge = ({ status }) => {
  const s = (status || 'paid').toLowerCase();
  return <span className={`status-badge ${s}`}>{s.toUpperCase()}</span>;
};

const formatTimestamp = (ts) => {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    return d.toLocaleString('en-IN', {
      day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch { return ts; }
};

const Dashboard = () => {
  useWebSocket();
  const { recentTravels, unpaidCount } = travelStore();
  const [stats, setStats] = useState({ totalStudents: 0, totalBuses: 0, todayTravels: 0, unpaidToday: 0 });
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [downloadingFormat, setDownloadingFormat] = useState(null);
  const [reportSummary, setReportSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await api.get('/analytics/dashboard');
        setStats(res.data);
      } catch (e) {
        console.error('Failed to fetch dashboard stats:', e);
      }
    };
    fetchStats();
  }, []);

  const openReportModal = async () => {
    setReportModalVisible(true);
    setLoadingSummary(true);
    try {
      const res = await api.get('/reports/fee-report/summary');
      setReportSummary(res.data);
    } catch (e) {
      message.error('Failed to load fee report summary');
    }
    setLoadingSummary(false);
  };

  const handleDownloadReport = async (format) => {
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
      message.error(`Failed to download ${format.toUpperCase()} report: ` + (e.response?.data?.message || e.message));
    }
    setDownloadingFormat(null);
  };

  const complianceRate = stats.todayTravels > 0
    ? Math.round(((stats.todayTravels - stats.unpaidToday) / stats.todayTravels) * 100)
    : 100;

  const columns = [
    {
      title: 'Student',
      key: 'student',
      render: (_, r) => {
        const name = r.studentId
          ? `${r.studentId.firstName || ''} ${r.studentId.lastName || ''}`.trim() || r.studentId.studentId
          : 'N/A';
        const sid = r.studentId?.studentId || '';
        const initials = name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || '?';
        return (
          <div className="student-name-cell">
            <Avatar
              src={r.studentId?.photoUrl || r.studentId?.faceData?.referenceImageUrl}
              size={32}
              style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', fontSize: 12, fontWeight: 700, flexShrink: 0 }}
            >
              {initials}
            </Avatar>
            <div>
              <div className="name-text">{name}</div>
              {sid && <div className="id-text">{sid}</div>}
            </div>
          </div>
        );
      },
    },
    {
      title: 'Bus',
      key: 'bus',
      render: (_, r) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <CarOutlined style={{ color: 'var(--color-text-muted)', fontSize: 13 }} />
          <span style={{ fontWeight: 500 }}>{r.busId?.busNumber || 'N/A'}</span>
        </span>
      ),
    },
    {
      title: 'Time',
      dataIndex: 'timestamp',
      key: 'time',
      render: (ts) => (
        <span className="nowrap" style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
          <ClockCircleOutlined style={{ marginRight: 5, opacity: 0.5 }} />
          {formatTimestamp(ts)}
        </span>
      ),
    },
    {
      title: 'Fee Status',
      dataIndex: 'feeStatusAtTime',
      key: 'status',
      render: (status) => <StatusBadge status={status} />,
    },
  ];

  return (
    <div>
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Dashboard</h1>
          <p className="page-subtitle">Real-time bus fleet & fee compliance overview</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            size="large"
            onClick={openReportModal}
            id="download-fee-report-btn"
            style={{
              borderRadius: 10,
              fontWeight: 600,
              background: 'linear-gradient(135deg, #4f46e5, #6366f1)',
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.25)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            Download Fee Report
          </Button>
          <div className="live-indicator" aria-label="Live data connection active">
            <span className="live-dot" />
            LIVE
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <KpiCard
          delay={1}
          icon={<TeamOutlined style={{ color: '#6366f1', fontSize: 22 }} />}
          iconBg="linear-gradient(135deg, #eef2ff, #e0e7ff)"
          value={stats.totalStudents}
          label="Total Students"
          trendLabel="All registered students"
        />
        <KpiCard
          delay={2}
          icon={<CarOutlined style={{ color: '#8b5cf6', fontSize: 22 }} />}
          iconBg="linear-gradient(135deg, #f5f3ff, #ede9fe)"
          value={stats.totalBuses}
          label="Active Buses"
          trendLabel="Fleet on routes"
        />
        <KpiCard
          delay={3}
          icon={<RiseOutlined style={{ color: '#10b981', fontSize: 22 }} />}
          iconBg="linear-gradient(135deg, #d1fae5, #a7f3d0)"
          value={stats.todayTravels}
          label="Today's Travels"
          trendLabel={`${complianceRate}% compliance rate`}
        />
        <KpiCard
          delay={4}
          icon={<WarningOutlined style={{ color: '#ef4444', fontSize: 22 }} />}
          iconBg="linear-gradient(135deg, #fee2e2, #fecaca)"
          value={stats.unpaidToday}
          label="Unpaid Today"
          trendLabel="Require resolution"
          isPulsing={stats.unpaidToday > 0}
        />
      </div>

      {/* Recent Travels Table */}
      <div
        className="premium-card animate-fade-in-up delay-4"
        style={{ padding: 0, overflow: 'hidden' }}
      >
        <div
          className="section-header"
          style={{ padding: '18px 24px', borderBottom: '1px solid var(--color-border)', margin: 0 }}
        >
          <div className="section-title">
            <ClockCircleOutlined style={{ color: 'var(--color-primary)' }} />
            Recent Travels
          </div>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            Updates in real-time via WebSocket
          </span>
        </div>
        <Table
          dataSource={recentTravels}
          columns={columns}
          rowKey="_id"
          pagination={false}
          locale={{
            emptyText: (
              <div className="empty-state">
                <div className="empty-state-icon">🚌</div>
                <div className="empty-state-text">No recent travel records</div>
              </div>
            ),
          }}
          style={{ borderRadius: 0 }}
        />
      </div>

      {/* Download Fee Report Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #10b981, #059669)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DownloadOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Download Student Fee Payment Report</div>
              <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--color-text-muted)' }}>Kongu Engineering College · Transport Division</div>
            </div>
          </div>
        }
        open={reportModalVisible}
        onCancel={() => setReportModalVisible(false)}
        footer={null}
        width={580}
        destroyOnClose
      >
        <div style={{ marginTop: 16 }}>
          {loadingSummary ? (
            <div style={{ textAlign: 'center', padding: '36px 0' }}>
              <Spin size="large" />
              <div style={{ marginTop: 12, color: 'var(--color-text-muted)' }}>Retrieving live database records...</div>
            </div>
          ) : reportSummary ? (
            <div>
              {/* Summary Metrics Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                <div style={{ padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Total Students</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>{reportSummary.totalStudents}</div>
                </div>
                <div style={{ padding: 12, background: '#ecfdf5', borderRadius: 8, border: '1px solid #a7f3d0', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#065f46', textTransform: 'uppercase' }}>Paid Students</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#059669', marginTop: 4 }}>{reportSummary.paidCount}</div>
                </div>
                <div style={{ padding: 12, background: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#991b1b', textTransform: 'uppercase' }}>Not Paid / Pending</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#dc2626', marginTop: 4 }}>{reportSummary.unpaidCount}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                <div style={{ padding: 14, background: '#f0fdf4', borderRadius: 8, border: '1px solid #86efac' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>Fee Collected</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#15803d', marginTop: 2 }}>
                    ₹ {reportSummary.totalFeeCollected.toLocaleString('en-IN')}
                  </div>
                  <div style={{ fontSize: 11, color: '#166534', marginTop: 2 }}>Compliance: {reportSummary.collectionRate}%</div>
                </div>
                <div style={{ padding: 14, background: '#fff1f2', borderRadius: 8, border: '1px solid #fca5a5' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#9f1239', textTransform: 'uppercase' }}>Outstanding Fee</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#be123c', marginTop: 2 }}>
                    ₹ {reportSummary.outstandingFeeAmount.toLocaleString('en-IN')}
                  </div>
                  <div style={{ fontSize: 11, color: '#9f1239', marginTop: 2 }}>Requires Collection</div>
                </div>
              </div>

              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 18, textAlign: 'center' }}>
                Both reports separate <strong>Paid</strong> and <strong>Not Paid / Pending</strong> students with complete academic, bus, fee, and contact details.
              </div>

              {/* Download Buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
                <Button
                  type="primary"
                  icon={<FileExcelOutlined style={{ fontSize: 18 }} />}
                  size="large"
                  loading={downloadingFormat === 'xlsx'}
                  onClick={() => handleDownloadReport('xlsx')}
                  style={{
                    height: 48,
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
                  icon={<FilePdfOutlined style={{ fontSize: 18 }} />}
                  size="large"
                  loading={downloadingFormat === 'pdf'}
                  onClick={() => handleDownloadReport('pdf')}
                  style={{
                    height: 48,
                    borderRadius: 10,
                    fontWeight: 600,
                  }}
                >
                  Download PDF (.pdf)
                </Button>
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--color-danger)', textAlign: 'center', padding: '20px 0' }}>
              Failed to load report data. Please check server connection.
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default Dashboard;