import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { axiosInstance } from '@/lib/public/axios';
import { AppSidebar } from '@/components/app-sidebar';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';

interface ParkingSession {
  id: string;
  ticket_number: string;
  license_plate: string;
  vehicle_type: string;
  status: string;
  entry_time: string;
  exit_time: string | null;
  calculated_charge: string | null;
}

const DashboardPage = () => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<ParkingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    axiosInstance
      .get('parking/sessions')
      .then((res) => setSessions(res.data))
      .catch(() => setError('Failed to load dashboard data.'))
      .finally(() => setLoading(false));
  }, []);

  const totalSessions = sessions.length;
  const activeSessions = sessions.filter((s) => s.status === 'ACTIVE').length;
  const totalRevenue = sessions.reduce((sum, s) => sum + (Number(s.calculated_charge) || 0), 0);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px' }}>
          <SidebarTrigger />
        </div>

        {loading ? (
          <div style={{ padding: 24 }}>Loading...</div>
        ) : error ? (
          <div style={{ padding: 24, color: 'red' }}>{error}</div>
        ) : (
          <div style={{ padding: '0 24px 24px', maxWidth: 960, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h1>Dashboard</h1>
              <button onClick={() => navigate('/')}>Back</button>
            </div>

            <div style={{ display: 'flex', gap: 16, margin: '24px 0' }}>
              <StatCard label="Total Sessions" value={totalSessions} />
              <StatCard label="Active Sessions" value={activeSessions} />
              <StatCard label="Total Revenue" value={totalRevenue.toFixed(2)} />
            </div>

            <h2>Recent Sessions</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <Th>Ticket</Th>
                  <Th>Plate</Th>
                  <Th>Status</Th>
                  <Th>Entry Time</Th>
                  <Th>Charge</Th>
                </tr>
              </thead>
              <tbody>
                {sessions.slice(0, 20).map((s) => (
                  <tr key={s.id}>
                    <Td>{s.ticket_number}</Td>
                    <Td>{s.license_plate}</Td>
                    <Td>{s.status}</Td>
                    <Td>{new Date(s.entry_time).toLocaleString()}</Td>
                    <Td>{s.calculated_charge ?? '-'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
};

const StatCard = ({ label, value }: { label: string; value: string | number }) => (
  <div style={{ flex: 1, border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
    <div style={{ fontSize: 13, color: '#666' }}>{label}</div>
    <div style={{ fontSize: 24, fontWeight: 600 }}>{value}</div>
  </div>
);

const Th = ({ children }: { children: React.ReactNode }) => (
  <th style={{ textAlign: 'left', borderBottom: '2px solid #ddd', padding: 8 }}>{children}</th>
);

const Td = ({ children }: { children: React.ReactNode }) => (
  <td style={{ borderBottom: '1px solid #eee', padding: 8 }}>{children}</td>
);

export default DashboardPage;
