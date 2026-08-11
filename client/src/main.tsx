import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BrowserRouter,
  Routes,
  Route,
  useNavigate,
  useParams,
} from 'react-router-dom';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import './styles.css';
import type { Link, Stats } from './types';

const api = async (path: string, opts?: RequestInit) => {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...opts,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || body.message || 'Request failed');
  }

  return response.status === 204 ? null : response.json();
};

/* =========================
   Layout
========================= */

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">↗</span>
          Shortlink Studio
        </div>

        <nav className="nav">
  <a className="active" href="/">
    Overview
  </a>
</nav>
        <div className="sidebar-foot">
          Campaign operations
          <br />
          Workspace / Default
        </div>
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}

/* =========================
   Create Link Modal
========================= */

function Create({
  onDone,
  onClose,
}: {
  onDone: (link: Link) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    destinationUrl: '',
    slug: '',
    clickCap: '100',
  });

  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    try {
      const link = await api('/api/links', {
        method: 'POST',
        body: JSON.stringify({
          destinationUrl: form.destinationUrl,
          slug: form.slug || undefined,
          clickCap: Number(form.clickCap),
        }),
      });

      onDone(link);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>Create a short link</h2>

        {error && <div className="notice">{error}</div>}

        <form onSubmit={submit}>
          <div className="field">
            <label>Destination URL</label>

            <input
              required
              type="url"
              placeholder="https://example.com/campaign"
              value={form.destinationUrl}
              onChange={(event) =>
                setForm({
                  ...form,
                  destinationUrl: event.target.value,
                })
              }
            />
          </div>

          <div className="field">
            <label>
              Custom slug{' '}
              <span
                style={{
                  color: '#70798c',
                  fontWeight: 400,
                }}
              >
                (optional)
              </span>
            </label>

            <input
              placeholder="spring-launch"
              value={form.slug}
              onChange={(event) =>
                setForm({
                  ...form,
                  slug: event.target.value,
                })
              }
            />
          </div>

          <div className="field">
            <label>Click cap</label>

            <input
              required
              type="number"
              min="1"
              value={form.clickCap}
              onChange={(event) =>
                setForm({
                  ...form,
                  clickCap: event.target.value,
                })
              }
            />
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
            >
              Cancel
            </button>

            <button type="submit" className="button">
              Create link
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* =========================
   Dashboard
========================= */

function Dashboard() {
  const [links, setLinks] = useState<Link[]>([]);
  const [query, setQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setError('');

      const result = await api(
        '/api/links?limit=50&search=' + encodeURIComponent(query)
      );

      setLinks(result.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    }
  };

  useEffect(() => {
    load();
  }, [query]);

  const active = links.filter((link) => link.status === 'active').length;

  const clicks = links.reduce(
    (total, link) => total + link.clickCount,
    0
  );

  const copy = async (slug: string) => {
    const shortUrl = `${window.location.origin}/r/${slug}`;

    try {
      await navigator.clipboard.writeText(shortUrl);
    } catch {
      window.prompt('Copy this short link:', shortUrl);
    }
  };

  const disable = async (id: string) => {
    try {
      await api(`/api/links/${id}/disable`, {
        method: 'PATCH',
      });

      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this link and its click history?')) {
      return;
    }

    try {
      await api(`/api/links/${id}`, {
        method: 'DELETE',
      });

      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    }
  };

  const handleCreated = (link: Link) => {
    setLinks((current) => [link, ...current]);
    setShowCreate(false);
  };

  return (
    <Layout>
      <div className="topbar">
        <div>
          <div className="eyebrow">Campaign operations</div>

          <h1 className="title">Link overview</h1>

          <p className="subtitle">
            Create, monitor, and control every short link in your workspace.
          </p>
        </div>

        <button
          className="button"
          onClick={() => setShowCreate(true)}
        >
          + Create link
        </button>
      </div>

      {error && <div className="notice">{error}</div>}

      <div className="stats">
        <div className="panel">
          <div className="stat-label">Total links</div>
          <div className="stat-value">{links.length}</div>
        </div>

        <div className="panel">
          <div className="stat-label">Active links</div>
          <div className="stat-value">{active}</div>
        </div>

        <div className="panel">
          <div className="stat-label">Tracked clicks</div>
          <div className="stat-value">
            {clicks.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="toolbar">
          <input
            className="search"
            placeholder="Search links or destinations"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />

          <span
            style={{
              color: '#70798c',
              fontSize: 13,
              alignSelf: 'center',
            }}
          >
            {links.length} links
          </span>
        </div>

        {links.length === 0 ? (
          <div className="empty">
            {query
              ? 'No links match your search.'
              : 'No links yet. Create your first campaign link.'}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Short link</th>
                  <th>Destination</th>
                  <th>Clicks</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>

              <tbody>
                {links.map((link) => (
                  <tr key={link.id}>
                    <td>
                      <a
                        className="slug"
                        href={`/links/${link.id}`}
                      >
                        {link.slug}
                      </a>
                    </td>

                    <td>
                      <div
                        className="destination"
                        title={link.destinationUrl}
                      >
                        {link.destinationUrl}
                      </div>
                    </td>

                    <td>
                      {link.clickCount} /{' '}
                      {link.clickCap ?? '∞'}
                    </td>

                    <td>
                      <span
                        className={`badge ${link.status}`}
                      >
                        {link.status}
                      </span>
                    </td>

                    <td>
                      <div className="actions">
                        <button
                          className="icon-btn"
                          onClick={() => copy(link.slug)}
                        >
                          Copy
                        </button>

                        {link.status === 'active' && (
                          <button
                            className="icon-btn"
                            onClick={() => disable(link.id)}
                          >
                            Disable
                          </button>
                        )}

                        <button
                          className="icon-btn"
                          onClick={() => remove(link.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <Create
          onClose={() => setShowCreate(false)}
          onDone={handleCreated}
        />
      )}
    </Layout>
  );
}

/* =========================
   Detail Page
========================= */

function Detail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [link, setLink] = useState<Link | null>(null);
  const [stats, setStats] = useState<Stats[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) {
      setError('Invalid link id');
      return;
    }

    setError('');

    Promise.all([
      api(`/api/links/${id}`),
      api(`/api/links/${id}/stats`),
    ])
      .then(([linkData, statsData]) => {
        setLink(linkData);
        setStats(statsData);
      })
      .catch((err) => {
        setError(
          err instanceof Error
            ? err.message
            : 'Request failed'
        );
      });
  }, [id]);

  if (error) {
    return (
      <Layout>
        <div className="notice">{error}</div>

        <button
          className="button secondary"
          onClick={() => navigate('/')}
        >
          Back to links
        </button>
      </Layout>
    );
  }

  if (!link) {
    return (
      <Layout>
        <div className="panel">Loading link details…</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="topbar">
        <div>
          <div className="eyebrow">Link detail</div>

          <h1 className="title">{link.slug}</h1>

          <p className="subtitle">
            {link.destinationUrl}
          </p>
        </div>

        <button
          className="button secondary"
          onClick={() => navigate('/')}
        >
          Back to links
        </button>
      </div>

      <div className="detail-grid">
        <div className="panel">
          <h2
            style={{
              fontFamily: 'Space Grotesk',
              marginTop: 0,
            }}
          >
            Seven-day performance
          </h2>

          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats}>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                />

                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11 }}
                />

                <Tooltip />

                <Area
                  type="monotone"
                  dataKey="clicks"
                  stroke="#5b55d9"
                  fill="#5b55d9"
                  fillOpacity={0.15}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel">
          <h2
            style={{
              fontFamily: 'Space Grotesk',
              marginTop: 0,
            }}
          >
            Link information
          </h2>

          <div className="meta">
            <div>
              <small>Status</small>

              <span
                className={`badge ${link.status}`}
              >
                {link.status}
              </span>
            </div>

            <div>
              <small>Created</small>

              <strong>
                {new Date(
                  link.createdAt
                ).toLocaleDateString()}
              </strong>
            </div>

            <div>
              <small>Clicks</small>

              <strong>
                {link.clickCount} /{' '}
                {link.clickCap ?? 'Unlimited'}
              </strong>
            </div>

            <div>
              <small>Redirect</small>

              <strong>/r/{link.slug}</strong>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

/* =========================
   App / Routes
========================= */

function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/links/:id" element={<Detail />} />
    </Routes>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);