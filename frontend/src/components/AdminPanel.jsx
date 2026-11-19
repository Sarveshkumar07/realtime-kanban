import { useCallback, useEffect, useState } from 'react';
import { api, RANK, ROLE_LABEL } from '../api';

function InlineForm({ placeholder, button, type = 'text', onSubmit, children }) {
  const [value, setValue] = useState('');
  return (
    <form
      className="inline-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!value.trim()) return;
        if (await onSubmit(value.trim())) setValue('');
      }}
    >
      <input type={type} value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} />
      {children}
      <button className="btn primary">{button}</button>
    </form>
  );
}

export default function AdminPanel({ org, tenant, onClose, onChanged, toast }) {
  const isOrgAdmin = org?.role === 'org_admin';
  const isTenantAdmin = tenant && RANK[tenant.role] >= 2;
  const [members, setMembers] = useState([]);
  const [role, setRole] = useState('member');

  const loadMembers = useCallback(async () => {
    if (tenant && isTenantAdmin) setMembers(await api.get(`/tenants/${tenant.id}/members`));
  }, [tenant, isTenantAdmin]);
  useEffect(() => {
    loadMembers().catch(() => {});
  }, [loadMembers]);

  // run an action, show a toast, report success so forms know whether to clear
  const act = async (fn, okMsg) => {
    try {
      await fn();
      if (okMsg) toast(okMsg, 'ok');
      return true;
    } catch (e) {
      toast(e.message, 'error');
      return false;
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Manage" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Manage</h2>
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
        </header>

        <section>
          <h3>New organization</h3>
          <p className="muted small">You become its admin. A first branch and a starter board are created for you.</p>
          <InlineForm
            placeholder="Organization name"
            button="Create"
            onSubmit={(name) =>
              act(async () => {
                const created = await api.post('/orgs', { name });
                await onChanged(created.id);
                onClose();
              }, 'Organization created')
            }
          />
        </section>

        {isOrgAdmin && (
          <>
            <section>
              <h3>Branches in {org.name}</h3>
              <ul className="rows">
                {org.tenants.map((t) => (
                  <li key={t.id}>
                    <span>{t.name}</span>
                    <button
                      className="btn danger"
                      onClick={() =>
                        window.confirm(`Delete "${t.name}" with all its boards and tasks? This cannot be undone.`) &&
                        act(async () => {
                          await api.del(`/tenants/${t.id}`);
                          await onChanged();
                        }, 'Branch deleted')
                      }
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
              <InlineForm
                placeholder="New branch name"
                button="Add branch"
                onSubmit={(name) =>
                  act(async () => {
                    await api.post(`/orgs/${org.id}/tenants`, { name });
                    await onChanged();
                  }, 'Branch added')
                }
              />
            </section>
            <section>
              <h3>Add an organization admin</h3>
              <p className="muted small">Org admins can open every branch. The person must already have an account.</p>
              <InlineForm type="email" placeholder="person@company.com" button="Make admin" onSubmit={(email) => act(() => api.post(`/orgs/${org.id}/admins`, { email }), 'Admin added')} />
            </section>
          </>
        )}

        {isTenantAdmin && (
          <section>
            <h3>People in {tenant.name}</h3>
            <ul className="rows">
              {members.map((m) => (
                <li key={m.userId + m.scope}>
                  <span>
                    {m.name} <span className="muted small">{m.email}</span>
                  </span>
                  <span className="role-chip">{ROLE_LABEL[m.role]}</span>
                  {m.scope === 'branch' && (
                    <button
                      className="btn danger"
                      onClick={() =>
                        act(async () => {
                          await api.del(`/tenants/${tenant.id}/members/${m.userId}`);
                          await loadMembers();
                        }, 'Removed')
                      }
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <InlineForm
              type="email"
              placeholder="person@company.com"
              button="Add to branch"
              onSubmit={(email) =>
                act(async () => {
                  await api.post(`/tenants/${tenant.id}/members`, { email, role });
                  await loadMembers();
                }, 'Added')
              }
            >
              <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role">
                <option value="member">Member</option>
                <option value="tenant_admin">Branch admin</option>
              </select>
            </InlineForm>
          </section>
        )}
      </div>
    </div>
  );
}
