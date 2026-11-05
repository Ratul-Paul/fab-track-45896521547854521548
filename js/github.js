/* Thin wrapper around the GitHub REST "contents" API. The data repo is the database. */
window.GH = (function () {
  const API = 'https://api.github.com';
  let cfg = {owner:'', repo:'', branch:'', token:''};

  const enc = p => p.split('/').map(encodeURIComponent).join('/');
  const rp = () => `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;
  const ref = () => cfg.branch ? `?ref=${encodeURIComponent(cfg.branch)}` : '';

  function b64enc(str){
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64dec(b64){
    const bin = atob(b64.replace(/\n/g, ''));
    return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
  }

  async function req(method, path, body, accept){
    const res = await fetch(API + path, {
      method,
      headers: Object.assign(
        {Authorization: 'Bearer ' + cfg.token, Accept: accept || 'application/vnd.github+json'},
        body ? {'Content-Type': 'application/json'} : {}
      ),
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store'
    });
    if (!res.ok){
      const err = new Error('GitHub ' + res.status);
      err.status = res.status;
      try { const j = await res.json(); err.detail = j.message; } catch (_) {}
      throw err;
    }
    if (accept && accept.includes('raw')) return res;
    return res.status === 204 ? null : res.json();
  }

  return {
    configure(c){ cfg = Object.assign({}, c); },
    me(){ return req('GET', '/user'); },
    repo(){ return req('GET', rp()); },

    /** Files and folders in a directory, or [] if it does not exist yet. */
    async list(dir){
      try {
        const r = await req('GET', `${rp()}/contents/${enc(dir)}${ref()}`);
        return Array.isArray(r) ? r : [];
      } catch (e) { if (e.status === 404) return []; throw e; }
    },

    /** Read a JSON file. Returns {data, sha} or null if it does not exist. */
    async getJson(path){
      try {
        const r = await req('GET', `${rp()}/contents/${enc(path)}${ref()}`);
        if (Array.isArray(r)) return null;
        let text;
        if (r.content && r.encoding === 'base64') text = b64dec(r.content);
        else text = await (await req('GET', `${rp()}/contents/${enc(path)}${ref()}`, null, 'application/vnd.github.raw')).text();
        return {data: JSON.parse(text), sha: r.sha};
      } catch (e) { if (e.status === 404) return null; throw e; }
    },

    /** Create or update a JSON file. Pass the previous sha when updating. */
    async putJson(path, obj, sha, message){
      const body = {message, content: b64enc(JSON.stringify(obj, null, 1))};
      if (cfg.branch) body.branch = cfg.branch;
      if (sha) body.sha = sha;
      const r = await req('PUT', `${rp()}/contents/${enc(path)}`, body);
      return {sha: r.content.sha};
    },

    /** Upload a binary file (content already base64 encoded). */
    async putBytes(path, base64, message){
      const body = {message, content: base64};
      if (cfg.branch) body.branch = cfg.branch;
      const r = await req('PUT', `${rp()}/contents/${enc(path)}`, body);
      return {sha: r.content.sha};
    },

    /** Download a file's bytes as a Blob (works for private repos). */
    async getBlob(path){
      const res = await req('GET', `${rp()}/contents/${enc(path)}${ref()}`, null, 'application/vnd.github.raw');
      return res.blob();
    },

    async del(path, message){
      const meta = await req('GET', `${rp()}/contents/${enc(path)}${ref()}`);
      const body = {message, sha: meta.sha};
      if (cfg.branch) body.branch = cfg.branch;
      return req('DELETE', `${rp()}/contents/${enc(path)}`, body);
    },
    delWithSha(path, sha, message){
      const body = {message, sha};
      if (cfg.branch) body.branch = cfg.branch;
      return req('DELETE', `${rp()}/contents/${enc(path)}`, body);
    }
  };
})();
