import SuperAdminAccounts from './SuperAdminAccounts';

const AdminDashboard = () => {
  return (
    <div className="animate-fade-in" style={{ padding: '2rem', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', gap: '2rem', height: '100%', overflowY: 'auto' }}>
      
      {/* Top Header & Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontWeight: 'bold', background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-hover))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Super Admin Control Panel
        </h1>
        
        <div style={{ display: 'flex', gap: '1rem', background: 'var(--bg-glass)', padding: '0.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
          <button 
            style={{ 
              padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 'bold',
              background: 'var(--accent-primary)',
              color: 'white'
            }}
          >
            Accounts Management
          </button>
        </div>
      </div>

      <SuperAdminAccounts />
    </div>
  );
};

export default AdminDashboard;
