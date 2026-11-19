import { useCallback, useEffect, useState } from 'react';
import { api, ROLE_LABEL } from '../api';
import Avatar from './Avatar.jsx';
import BoardView from './BoardView.jsx';
import AdminPanel from './AdminPanel.jsx';

export default function Workspace({ user, onLogout, toast }) {
  const [orgs, setOrgs] = useState(null);
  const [orgId, setOrgId] = useState(localStorage.getItem('livewall_org'));
  const [tenantId, setTenantId] = useState(localStorage.getItem('livewall_tenant'));
  const [showAdmin, setShowAdmin] = useState(false);

  const reload = useCallback(
    async (selectOrgId) => {
      try {
        const list = await api.get('/orgs');
        setOrgs(list);
        if (selectOrgId) {
          setOrgId(selectOrgId);
          setTenantId(null);
        }
      } catch (e) {
        toast(e.message, 'error');
        setOrgs((o) => o || []);
      }
    },
    [toast]
  );
  useEffect(() => {
    reload();
  }, [reload]);

  // Selection falls back to the first available org / tenant, so a stale id can never break the UI.
  const org = orgs?.find((o) => o.id === orgId) || orgs?.[0];
  const tenant = org?.tenants.find((t) => t.id === tenantId) || org?.tenants[0];
  useEffect(() => {
    if (org) localStorage.setItem('livewall_org', org.id);
    if (tenant) localStorage.setItem('livewall_tenant', tenant.id);
  }, [org, tenant]);

  const onAccessLost = useCallback(() => {
    toast('Your access to this branch changed. Refreshing…', 'error');
    reload();
  }, [reload, toast]);

  if (!orgs) return <div className="splash">Loading workspace…</div>;
  const canManage = org && (org.role === 'org_admin' || tenant?.role === 'tenant_admin');

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Livewall</span>
        {org && (
          <label className="org-select">
            <span className="sr-only">Organization</span>
            <select
              value={org.id}
              onChange={(e) => {
                setOrgId(e.target.value);
                setTenantId(null);
              }}
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <nav className="tenant-tabs" aria-label="Branches">
          {org?.tenants.map((t) => (
            <button key={t.id} className={`tab ${t.id === tenant?.id ? 'active' : ''}`} onClick={() => setTenantId(t.id)}>
              {t.name}
            </button>
          ))}
        </nav>
        <span className="spacer" />
        {tenant && <span className="role-chip">{ROLE_LABEL[tenant.role]}</span>}
        <button className="btn ghost" onClick={() => setShowAdmin(true)}>
          {canManage ? 'Manage' : 'Organizations'}
        </button>
        <Avatar user={user} />
        <button className="btn ghost" onClick={onLogout}>
          Sign out
        </button>
      </header>

      {tenant ? (
        <BoardView key={tenant.id} tenant={tenant} user={user} toast={toast} onAccessLost={onAccessLost} />
      ) : (
        <main className="empty">
          <h2>{org ? 'This organization has no branches yet' : 'Create your first organization'}</h2>
          <p className="muted">{org ? 'Open Manage and add a branch to start a board.' : 'Open Organizations and create one. It comes with a branch and a starter board.'}</p>
          <button className="btn primary" onClick={() => setShowAdmin(true)}>
            {org ? 'Manage branches' : 'Create organization'}
          </button>
        </main>
      )}

      {showAdmin && <AdminPanel org={org} tenant={tenant} onClose={() => setShowAdmin(false)} onChanged={reload} toast={toast} />}
    </div>
  );
}
