const getToken = () => localStorage.getItem('maapsure_token');

export async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');

  const response = await fetch(path, { ...options, headers });
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    if (response.status === 401 && !path.includes('/auth/login')) {
      localStorage.removeItem('maapsure_token');
      localStorage.removeItem('maapsure_user');
      window.dispatchEvent(new Event('maapsure:logout'));
    }
    throw new Error(body?.error || body || 'Request failed.');
  }
  return body;
}

export async function downloadFile(path, filename) {
  const token = getToken();
  const response = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) throw new Error('The report could not be downloaded.');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
