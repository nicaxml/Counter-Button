(function() {
    window.cache = { lines: [], mesin: [], styles: [], orders: [], devices: [], users: [], proses: [] };
    window.preflightDone = false;
    window.preflightAuth = async function() {
      if (window.preflightDone) return;
      try { await fetch('/api/me', { credentials: 'include' }); } catch {}
      window.preflightDone = true;
    };
  
    window.fetchJSON = async function(url, opts = {}) {
      try {
        const res = await fetch(url, {
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          credentials: 'include',
          ...opts
        });
        if (res.status === 401) {
          window.location.href = '/';
          return null;
        }
        if (res.status === 204) return null;
        if (res.ok) return await res.json();
        throw new Error(`Request failed: ${res.status}`);
      } catch (e) {
        console.error('Fetch error:', e);
        return { error: e.message };
      }
    };
  
    window.setOptions = function(select, data, valKey, textKeyOrFn) {
      if (!select) return;
      const current = select.value;
      if (!Array.isArray(data) || data.length === 0) {
        return;
      }
      select.innerHTML = select.querySelector('option') ? select.querySelector('option').outerHTML : '';
      if (Array.isArray(data)) {
        data.forEach(item => {
          const val = item[valKey];
          const text = typeof textKeyOrFn === 'function' ? textKeyOrFn(item) : item[textKeyOrFn];
          const opt = document.createElement('option');
          opt.value = val;
          opt.textContent = text;
          select.appendChild(opt);
        });
      }
      if (current) select.value = current;
    };
  
    // --- Helper for Mesin ---
    const MESIN_TYPES = {
      'Single Needle': ['High Speed Lockstitch', 'Heavy Duty', 'Needle Feed'],
      'Double Needle': ['Chain Stitch', 'Lock Stitch'],
      'Overlock': ['3 Thread', '4 Thread', '5 Thread', '6 Thread'],
      'Overdeck': ['Cylinder Bed', 'Flat Bed'],
      'Bartack': ['Computer Bartack', 'Mechanical Bartack'],
      'Button Hole': ['Straight', 'Eyelet'],
      'Button Attach': ['Lockstitch Button', 'Chainstitch Button'],
      'Embroidery': ['Computerized Embroidery', 'Manual Embroidery'],
      'Cutting': ['Laser Cutting', 'Knife Cutting'],
      'Pressing': ['Steam Pressing', 'Heat Pressing']
    };

    window.updateMesinTypes = function() {
        const form = document.getElementById('formMesin');
        if (!form) return;
        const catSelect = form.querySelector('select[name="kategori"]');
        const typeSelect = form.querySelector('select[name="jenis"]');
        
        if (!catSelect || !typeSelect) return;
        
        const category = catSelect.value;
        const currentType = typeSelect.dataset.value || typeSelect.value;
        
        typeSelect.innerHTML = '<option value="">-- Pilih Jenis --</option>';
        
        if (category && MESIN_TYPES[category]) {
            MESIN_TYPES[category].forEach(type => {
                const opt = document.createElement('option');
                opt.value = type;
                opt.textContent = type;
                if (type === currentType) opt.selected = true;
                typeSelect.appendChild(opt);
            });
        }
    };

    window.currentSort = { col: 'id', asc: true };

    window.sortMesin = function(col) {
        if (window.currentSort.col === col) {
            window.currentSort.asc = !window.currentSort.asc;
        } else {
            window.currentSort.col = col;
            window.currentSort.asc = true;
        }
        
        window.cache.mesin.sort((a, b) => {
            const valA = (a[col] || '').toString().toLowerCase();
            const valB = (b[col] || '').toString().toLowerCase();
            if (valA < valB) return window.currentSort.asc ? -1 : 1;
            if (valA > valB) return window.currentSort.asc ? 1 : -1;
            return 0;
        });
        
        window.renderMesinTable(); 
    };

    window.refreshMesinFilterOptions = function() {
        const katSel = document.getElementById('filterMesinKategori');
        const jenisSel = document.getElementById('filterMesinJenis');
        if (!katSel || !jenisSel) return;
        const currentKat = katSel.value;
        const currentJenis = jenisSel.value;
        const uniqueKat = [...new Set((cache.mesin || []).map(m => m.kategori).filter(Boolean))].sort();
        katSel.innerHTML = '<option value="">Semua</option>';
        uniqueKat.forEach(k => {
            const opt = document.createElement('option');
            opt.value = k;
            opt.textContent = k;
            katSel.appendChild(opt);
        });
        if (currentKat) katSel.value = currentKat;
        const jenisList = [...new Set((cache.mesin || []).filter(m => !katSel.value || m.kategori === katSel.value).map(m => m.jenis).filter(Boolean))].sort();
        jenisSel.innerHTML = '<option value="">Semua</option>';
        jenisList.forEach(j => {
            const opt = document.createElement('option');
            opt.value = j;
            opt.textContent = j;
            jenisSel.appendChild(opt);
        });
        if (currentJenis) jenisSel.value = currentJenis;
    };
 
    window.renderMesinTable = function() {
        const table = document.getElementById('tableMesin');
        if (!table) return;
        const arrow = window.currentSort.asc ? ' \u2191' : ' \u2193';
        const getArrow = (col) => window.currentSort.col === col ? arrow : '';
        const katSel = document.getElementById('filterMesinKategori');
        const jenisSel = document.getElementById('filterMesinJenis');
        const qEl = document.getElementById('searchMesinNoSeri');
        const kat = katSel ? katSel.value : '';
        const jenis = jenisSel ? jenisSel.value : '';
        const q = qEl ? String(qEl.value || '').trim().toLowerCase() : '';
        const rows = (window.cache.mesin || []).filter(m => {
            const okKat = kat ? m.kategori === kat : true;
            const okJenis = jenis ? m.jenis === jenis : true;
            const okSearch = q ? String(m.no_seri || '').toLowerCase().includes(q) : true;
            return okKat && okJenis && okSearch;
        });
        table.innerHTML = `<thead>
            <tr>
                <th onclick="sortMesin('id')" style="cursor:pointer">ID ${getArrow('id')}</th>
                <th onclick="sortMesin('no_seri')" style="cursor:pointer">No Seri ${getArrow('no_seri')}</th>
                <th onclick="sortMesin('merk')" style="cursor:pointer">Merk ${getArrow('merk')}</th>
                <th onclick="sortMesin('kategori')" style="cursor:pointer">Kategori ${getArrow('kategori')}</th>
                <th onclick="sortMesin('jenis')" style="cursor:pointer">Jenis ${getArrow('jenis')}</th>
                <th>Aksi</th>
            </tr>
        </thead><tbody>
          ${rows.map(r => `
            <tr>
              <td>${r.id}</td>
              <td>${r.no_seri || '-'}</td>
              <td>${r.merk || '-'}</td>
              <td>${r.kategori || '-'}</td>
              <td>${r.jenis || '-'}</td>
              <td>
                <button class="btn btn-sm" onclick="editItem('mesin', ${r.id})">Edit</button>
                <button class="btn btn-danger btn-sm" onclick="deleteItem('mesin', ${r.id})">Hapus</button>
              </td>
            </tr>
          `).join('')}
        </tbody>`;
    };

    window.loadLine = async function() {
      await window.preflightAuth();
      const data = await fetchJSON('/api/admin/lines');
      window.cache.lines = Array.isArray(data) ? data : [];
      const table = document.getElementById('tableLine');
      if (table) {
        table.innerHTML = `<thead><tr><th>ID</th><th>Nama Line</th><th>Aksi</th></tr></thead><tbody>
          ${window.cache.lines.map(r => `
            <tr>
              <td>${r.id}</td>
              <td>${r.nama_line}</td>
              <td>
                <button class="btn btn-sm" onclick="editItem('lines', ${r.id})">Edit</button>
                <button class="btn btn-danger btn-sm" onclick="deleteItem('lines', ${r.id})">Hapus</button>
              </td>
            </tr>
          `).join('')}
        </tbody>`;
        if (!window.cache.lines.length) {
          table.innerHTML = `<thead><tr><th>ID</th><th>Nama Line</th><th>Aksi</th></tr></thead><tbody><tr><td colspan="3">Tidak ada data</td></tr></tbody>`;
        }
      }
      // Update dropdowns
      document.querySelectorAll('select[name="line_id"]').forEach(s => setOptions(s, window.cache.lines, 'id', 'nama_line'));
      setOptions(document.getElementById('admDashLine'), window.cache.lines, 'id', 'nama_line');
      setOptions(document.getElementById('filterSumLine'), window.cache.lines, 'id', 'nama_line');
    };
  
    window.loadMesin = async function() {
      await window.preflightAuth();
      const data = await fetchJSON('/api/admin/mesin');
      window.cache.mesin = Array.isArray(data) ? data : [];
      
      // Apply current sort
      if (window.currentSort.col) {
           const col = window.currentSort.col;
           window.cache.mesin.sort((a, b) => {
                const valA = (a[col] || '').toString().toLowerCase();
                const valB = (b[col] || '').toString().toLowerCase();
                if (valA < valB) return window.currentSort.asc ? -1 : 1;
                if (valA > valB) return window.currentSort.asc ? 1 : -1;
                return 0;
           });
      }
      
      if (typeof window.refreshMesinFilterOptions === 'function') {
          window.refreshMesinFilterOptions();
      }
       
      window.renderMesinTable();
    };
  
    window.formatDate = function(dateStr) {
      if (!dateStr) return '-';
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    window.loadStyle = async function() {
      await window.preflightAuth();
      const data = await fetchJSON('/api/admin/styles');
      window.cache.styles = Array.isArray(data) ? data : [];
      const table = document.getElementById('tableStyle');
      if (table) {
        table.innerHTML = `<thead><tr><th>ID</th><th>ORC</th><th>Style</th><th>Color</th><th>Qty</th><th>Shipment Date</th><th>Aksi</th></tr></thead><tbody>
          ${window.cache.styles.map(r => `
            <tr>
              <td>${r.id}</td>
              <td>${r.orc}</td>
              <td>${r.style}</td>
              <td>${r.color}</td>
              <td>${r.quantity}</td>
              <td>${formatDate(r.shipmentdate)}</td>
              <td>
                <button class="btn btn-sm" onclick="editItem('styles', ${r.id})">Edit</button>
                <button class="btn btn-danger btn-sm" onclick="deleteItem('styles', ${r.id})">Hapus</button>
              </td>
            </tr>
          `).join('')}
        </tbody>`;
        if (!window.cache.styles.length) {
          table.innerHTML = `<thead><tr><th>ID</th><th>ORC</th><th>Style</th><th>Color</th><th>Qty</th><th>Shipment Date</th><th>Aksi</th></tr></thead><tbody><tr><td colspan="7">Tidak ada data</td></tr></tbody>`;
        }
      }
      setOptions(document.getElementById('prosesStyleSelect'), window.cache.styles, 'id', r => `${r.orc} - ${r.style}`);
    };

    window.loadProses = async function() {
      await window.preflightAuth();
      const styleSelect = document.getElementById('prosesStyleSelect');
      const styleId = styleSelect ? styleSelect.value : null;

      // Jika belum pilih ORC, jangan tampilkan proses
      if (!styleId) {
        const table = document.getElementById('tableProses');
        if (table) {
          table.innerHTML = `<thead><tr><th>Urutan</th><th>Nama Proses</th><th>Tipe</th><th>Aksi</th></tr></thead><tbody><tr><td colspan="4">Pilih ORC terlebih dahulu</td></tr></tbody>`;
        }
        return;
      }

      const url = `/api/admin/proses?style_id=${styleId}`;
      const data = await fetchJSON(url);
      const rows = Array.isArray(data) ? data : [];
      const table = document.getElementById('tableProses');
      if (table) {
        table.innerHTML = `<thead><tr><th>Urutan</th><th>Nama Proses</th><th>Tipe</th><th>Aksi</th></tr></thead><tbody>
          ${rows.map(r => `
            <tr>
              <td>${r.urutan}</td>
              <td>${r.nama_proses}</td>
              <td>${r.independent ? 'Independent' : 'Dependent'}</td>
              <td>
                <button class="btn btn-sm" onclick="editItem('proses', ${r.id})">Edit</button>
                <button class="btn btn-danger btn-sm" onclick="deleteItem('proses', ${r.id})">Hapus</button>
              </td>
            </tr>
          `).join('')}
        </tbody>`;
        if (!rows.length) {
          table.innerHTML = `<thead><tr><th>Urutan</th><th>Nama Proses</th><th>Tipe</th><th>Aksi</th></tr></thead><tbody><tr><td colspan="4">Tidak ada data</td></tr></tbody>`;
        }
      }
    };

    window.loadDevice = async function() {
      await window.preflightAuth();
      const data = await fetchJSON('/api/admin/devices');
      window.cache.devices = Array.isArray(data) ? data : [];
      const table = document.getElementById('tableDevice');
      if (table) {
        table.innerHTML = `<thead><tr><th>ID</th><th>Nama</th><th>Tipe</th><th>Status</th><th>Aksi</th></tr></thead><tbody>
          ${window.cache.devices.map(r => `
            <tr>
              <td>${r.id}</td>
              <td>${r.nama || r.no_seri}</td>
              <td>${r.tipe || r.kategori}</td>
              <td>${r.status || r.jenis}</td>
              <td>
                <button class="btn btn-sm" onclick="editItem('devices', ${r.id})">Edit</button>
                <button class="btn btn-danger btn-sm" onclick="deleteItem('devices', ${r.id})">Hapus</button>
              </td>
            </tr>
          `).join('')}
        </tbody>`;
        if (!window.cache.devices.length) {
          table.innerHTML = `<thead><tr><th>ID</th><th>Nama</th><th>Tipe</th><th>Status</th><th>Aksi</th></tr></thead><tbody><tr><td colspan="5">Tidak ada data</td></tr></tbody>`;
        }
      }
    };
  
    window.loadAllProses = async function() {
      const data = await fetchJSON('/api/admin/proses');
      window.cache.proses = Array.isArray(data) ? data : [];
    };

    window.loadOrder = async function() {
        await window.preflightAuth();
        const data = await fetchJSON('/api/admin/orders');
        window.cache.orders = Array.isArray(data) ? data : [];
        
        // Ensure dependent data is loaded
        if (!window.cache.lines.length) await loadLine();
        if (!window.cache.styles.length) await loadStyle();
        if (!window.cache.mesin.length) await loadMesin();
        if (!window.cache.devices.length) await loadDevice();
        if (!window.cache.proses || !window.cache.proses.length) await loadAllProses();

        const table = document.getElementById('tableOrder');
        if (table) {
            table.innerHTML = `<thead>
                <tr>
                    <th>ID</th>
                    <th>Urutan</th>
                    <th>ORC</th>
                    <th>Line</th>
                    <th>Proses</th>
                    <th>Mesin</th>
                    <th>Transmitter</th>
                    <th>Status</th>
                    <th>Aksi</th>
                </tr>
            </thead><tbody>
                ${window.cache.orders.map(o => {
                    const ln = window.cache.lines.find(l => l.id == o.line_id);
                    const st = window.cache.styles.find(s => s.id == o.style_id);
                    const ms = window.cache.mesin.find(m => m.id == o.mesin_id);
                    const tx = window.cache.devices.find(d => d.id == o.transmitter_id);
                    const pr = window.cache.proses.find(p => p.id == o.proses_id);
                    return `
                    <tr>
                        <td>${o.id}</td>
                        <td>${o.urutan || '-'}</td>
                        <td>${o.orc || (st ? st.orc : '-')}</td>
                        <td>${ln ? ln.nama_line : o.line_id}</td>
                        <td>${pr ? pr.nama_proses : (o.proses_id || '-')}</td>
                        <td>${ms ? (ms.no_seri || ms.nama) : o.mesin_id}</td>
                        <td>${tx ? tx.nama : '-'}</td>
                        <td>${o.status || 'aktif'}</td>
                        <td>
                          <button class="btn btn-sm" onclick="editItem('orders', ${o.id})">Edit</button>
                          <button class="btn btn-danger btn-sm" onclick="deleteItem('orders', ${o.id})">Hapus</button>
                        </td>
                    </tr>
                    `;
                }).join('')}
            </tbody>`;
            if (!window.cache.orders.length) {
                table.innerHTML = `<thead>
                    <tr>
                        <th>ID</th>
                        <th>Urutan</th>
                        <th>ORC</th>
                        <th>Line</th>
                        <th>Proses</th>
                        <th>Mesin</th>
                        <th>Transmitter</th>
                        <th>Status</th>
                        <th>Aksi</th>
                    </tr>
                </thead><tbody><tr><td colspan="9">Tidak ada data</td></tr></tbody>`;
            }
        }

        // Initialize Tab Logic if not already done
        if (typeof window.setupOrderTabLogic === 'function') {
            window.setupOrderTabLogic();
        }
    };

    window.loadUsers = async function() {
        await window.preflightAuth();
        const data = await fetchJSON('/api/admin/users');
        window.cache.users = Array.isArray(data) ? data : [];
        if (!window.cache.lines.length) await loadLine();
        const roleEl = document.getElementById('filterUserRole');
        const searchEl = document.getElementById('searchUserName');
        const role = roleEl ? roleEl.value : '';
        const q = searchEl ? String(searchEl.value || '').trim().toLowerCase() : '';
        const rows = (window.cache.users || []).filter(u => {
            const okRole = role ? String(u.role || '').toLowerCase() === role.toLowerCase() : true;
            const okName = q ? String(u.username || '').toLowerCase().includes(q) : true;
            return okRole && okName;
        });
        const table = document.getElementById('tableUsers');
        if (table) {
          table.innerHTML = `<thead><tr><th>ID</th><th>Username</th><th>Role</th><th>Line</th><th>Aksi</th></tr></thead><tbody>
            ${rows.map(u => {
                 const ln = window.cache.lines.find(l => l.id == u.line_id);
                 return `
                 <tr>
                    <td>${u.id}</td>
                    <td>${u.username}</td>
                    <td>${u.role}</td>
                    <td>${ln ? ln.nama_line : '-'}</td>
                    <td>
                      <button class="btn btn-sm" onclick="editItem('users', ${u.id})">Edit</button>
                      <button class="btn btn-danger btn-sm" onclick="deleteItem('users', ${u.id})">Hapus</button>
                    </td>
                 </tr>
                 `;
            }).join('')}
          </tbody>`;
          if (!rows.length) {
            table.innerHTML = `<thead><tr><th>ID</th><th>Username</th><th>Role</th><th>Line</th><th>Aksi</th></tr></thead><tbody><tr><td colspan="5">Tidak ada data</td></tr></tbody>`;
          }
        }
      };
    
    window.loadProductionSummary = async function() {
        await window.preflightAuth();
        const table = document.getElementById('tableSummary');
        if (!table) return;
        const start = document.getElementById('filterSumStart').value;
        const end = document.getElementById('filterSumEnd').value;
        const line = document.getElementById('filterSumLine').value;
        const style = document.getElementById('filterSumStyle').value;
        
        const q = new URLSearchParams();
        if(start) q.append('start_date', start);
        if(end) q.append('end_date', end);
        if(line) q.append('line_id', line);
        if(style) q.append('style_id', style);
        
        const data = await fetchJSON(`/api/admin/production-summary?${q.toString()}`);
        const rows = Array.isArray(data) ? data : [];
        
        table.innerHTML = `<thead><tr><th>Tanggal</th><th>Line</th><th>Style</th><th>Output</th><th>Reject</th><th>Repair</th></tr></thead><tbody>
            ${rows.map(r => `
                <tr>
                    <td>${r.date || '-'}</td>
                    <td>${r.line_name || '-'}</td>
                    <td>${r.style_name || '-'}</td>
                    <td>${r.output_count || 0}</td>
                    <td>${r.reject_count || 0}</td>
                    <td>${r.repair_count || 0}</td>
                </tr>
            `).join('')}
        </tbody>`;
    };
    
    window.updateStyleDropdowns = async function(lineElId, styleElId) {
        const lineSel = document.getElementById(lineElId);
        const styleSel = document.getElementById(styleElId);
        if (!lineSel || !styleSel) return;
        
        const lineId = lineSel.value;
        const currentStyle = styleSel.value;
        
        styleSel.innerHTML = '<option value="">Semua</option>';
        
        if (!lineId) {
             // Show all styles from cache
             if (window.cache.styles) {
                 window.cache.styles.forEach(s => {
                     const opt = document.createElement('option');
                     opt.value = s.id;
                     opt.textContent = `${s.orc} - ${s.style}`;
                     styleSel.appendChild(opt);
                 });
             }
        } else {
             let res = await fetchJSON(`/api/iot/styles_by_line?line_id=${lineId}&_t=${Date.now()}`);
             if (res && !Array.isArray(res) && (res.style_id || res.style)) {
                 res = [res];
             }

             if (Array.isArray(res) && res.length) {
                 // Strict Filter: Ensure data belongs to this line
                 res = res.filter(r => !r.line_id || String(r.line_id) === String(lineId));

                 res.forEach(s => {
                     const opt = document.createElement('option');
                     opt.value = s.style_id || s.id;
                     opt.textContent = `${s.style} (${s.orc})`;
                     styleSel.appendChild(opt);
                 });
             }
        }
        
        // Restore selection if possible
        if (currentStyle) {
             const exists = styleSel.querySelector(`option[value="${currentStyle}"]`);
             if (exists) styleSel.value = currentStyle;
        }
    };

    window.loadAdminDash = async function() {
        await window.preflightAuth();
        if (!window.cache.lines.length) await loadLine();
        if (!window.cache.styles.length) await loadStyle();
        const lineSel = document.getElementById('admDashLine');
        const styleSel = document.getElementById('admDashStyle');
        const selectedLines = lineSel ? Array.from(lineSel.selectedOptions).map(o => parseInt(o.value, 10)).filter(Boolean) : [];
        const styleId = styleSel ? parseInt(styleSel.value || '', 10) || null : null;
        const requests = [];
        if (selectedLines.length) {
            for (const lid of selectedLines) {
                const q = new URLSearchParams();
                q.set('scope', 'harian');
                q.set('line_id', String(lid));
                if (styleId) q.set('style_id', String(styleId));
                requests.push(fetchJSON(`/api/dashboard?${q.toString()}`));
            }
        } else {
            const q = new URLSearchParams();
            q.set('scope', 'harian');
            if (styleId) q.set('style_id', String(styleId));
            requests.push(fetchJSON(`/api/dashboard?${q.toString()}`));
        }
        const results = await Promise.all(requests);
        const all = results.filter(r => r && r.summary && Array.isArray(r.by_transmitter));
        const total = all.reduce((acc, r) => ({
            output: acc.output + (r.summary.output || 0),
            reject: acc.reject + (r.summary.reject || 0),
            repair: acc.repair + (r.summary.repair || 0),
        }), { output: 0, reject: 0, repair: 0 });
        const rows = all.flatMap(r => r.by_transmitter);
        const outEl = document.getElementById('admSumOutput');
        const rejEl = document.getElementById('admSumReject');
        const repEl = document.getElementById('admSumRepair');
        if (outEl) outEl.textContent = String(total.output || 0);
        if (rejEl) rejEl.textContent = String(total.reject || 0);
        if (repEl) repEl.textContent = String(total.repair || 0);
        const table = document.getElementById('tableAdminDash');
        if (table) {
            if (!rows.length) {
                table.innerHTML = `<thead><tr><th>Nama</th><th>Line</th><th>Style</th><th>Output</th><th>Reject</th><th>Repair</th></tr></thead><tbody><tr><td colspan="6">Tidak ada data</td></tr></tbody>`;
            } else {
                table.innerHTML = `<thead><tr><th>Nama</th><th>Line</th><th>Style</th><th>Output</th><th>Reject</th><th>Repair</th></tr></thead><tbody>
                  ${rows.map(r => `
                      <tr>
                          <td>${r.nama}</td>
                          <td>${r.line_name || '-'}</td>
                          <td>${r.style_name || '-'}</td>
                          <td>${r.output || 0}</td>
                          <td>${r.reject || 0}</td>
                          <td>${r.repair || 0}</td>
                      </tr>
                  `).join('')}
                </tbody>`;
            }
        }
    };

    window.deleteItem = async function(entity, id) {
        if (!confirm('Apakah anda yakin ingin menghapus item ini?')) return;
        const res = await fetchJSON(`/api/admin/${entity}/${id}`, { method: 'DELETE' });
        if (res && (res.ok || !res.error)) {
            // Reload appropriate section
            if (entity === 'lines') loadLine();
            if (entity === 'mesin') loadMesin();
            if (entity === 'styles') loadStyle();
            if (entity === 'proses') loadProses();
            if (entity === 'devices') loadDevice();
            if (entity === 'orders') loadOrder();
            if (entity === 'users') loadUsers();
        } else {
            alert('Gagal menghapus: ' + (res.error || 'Unknown error'));
        }
    };

    window.loadAll = async function() {
        await Promise.all([
            loadLine(),
            loadMesin(),
            loadStyle(),
            loadDevice(),
            loadUsers(),
            loadAllProses()
        ]);
        // Dependent loads
        loadOrder();
        loadProses();
        await window.updateStyleDropdowns('admDashLine', 'admDashStyle');
        await window.updateStyleDropdowns('filterSumLine', 'filterSumStyle');
        loadAdminDash();
    };

    // --- Form Handlers ---
    document.addEventListener('DOMContentLoaded', async () => {
        // Force load all data on page load
        if (window.loadAll) {
             setTimeout(window.loadAll, 100); 
        }

        try {
            const me = await fetchJSON('/api/me');
            if (!me || !me.user) {
                window.location.href = '/';
                return;
            }
        } catch {}
        try {
            const banner = document.getElementById('statusBanner');
            if (banner) {
                const res = await fetchJSON('/api/health/db');
                if (res && res.ok) {
                    banner.textContent = `Database ${res.db_name || ''} terhubung`;
                    banner.style.background = '#ecfdf5';
                    banner.style.borderColor = '#10b981';
                    banner.style.color = '#065f46';
                } else {
                    banner.textContent = `Gagal menghubungkan database: ${(res && res.error) || 'unknown'}`;
                    banner.style.background = '#fef2f2';
                    banner.style.borderColor = '#ef4444';
                    banner.style.color = '#7f1d1d';
                }
                banner.style.display = 'block';
            }
        } catch {}
        const setupForm = (id, endpoint, reloadFn, entity) => {
            const form = document.getElementById(id);
            if (!form) return;
            form.onsubmit = async (e) => {
                e.preventDefault();
                const fd = new FormData(form);
                const data = Object.fromEntries(fd.entries());
                if (id === 'formUser') {
                    const role = data.role;
                    if (role === 'user') {
                        if (!data.line_id) {
                            alert('Mohon pilih line untuk role user');
                            return;
                        }
                    }
                    if (!data.password || !data.password.trim()) {
                        delete data.password;
                    }
                }
                let url = endpoint;
                let method = 'POST';
                if (form.dataset.editId && entity) {
                    url = `/api/admin/${entity}/${form.dataset.editId}`;
                    method = 'PUT';
                }
                const res = await fetchJSON(url, { method, body: JSON.stringify(data) });
                if (res && !res.error) {
                    form.reset();
                    form.dataset.editId = '';
                    form.dataset.entity = '';
                    const popup = form.closest('.popup-content');
                    if (popup) popup.parentElement.style.display = 'none';
                    if (reloadFn) reloadFn();
                    alert('Berhasil disimpan');
                } else {
                    alert('Gagal menyimpan: ' + (res.error || 'Unknown error'));
                }
            };
        };

        setupForm('formLine', '/api/admin/lines', loadLine, 'lines');
        setupForm('formMesin', '/api/admin/mesin', loadMesin, 'mesin');
        setupForm('formStyle', '/api/admin/styles', loadStyle, 'styles');
        setupForm('formProses', '/api/admin/proses', loadProses, 'proses');
        setupForm('formDevice', '/api/admin/devices', loadDevice, 'devices');
        setupForm('formUser', '/api/admin/users', loadUsers, 'users');
        
        // Buttons
        const btnRefreshSum = document.getElementById('btnRefreshSummary');
        if (btnRefreshSum) btnRefreshSum.onclick = loadProductionSummary;
        
        const prosesStyleSelect = document.getElementById('prosesStyleSelect');
        if (prosesStyleSelect) prosesStyleSelect.onchange = loadProses;
        
        const clockEl = document.getElementById('adminClock') || document.getElementById('clock');
        if (clockEl) {
            const tick = () => { clockEl.textContent = new Date().toLocaleString('id-ID'); };
            tick();
            setInterval(tick, 1000);
        }
        
        const btnLogoutHeader = document.getElementById('btnLogout');
        const btnLogoutNav = document.getElementById('logoutBtn');
        const bindLogout = (el) => {
            if (!el) return;
            el.addEventListener('click', async (e) => {
                e.preventDefault();
                try { await fetch('/api/logout', { method: 'POST' }); } catch {}
                window.location.href = '/';
            });
        };
        bindLogout(btnLogoutHeader);
        bindLogout(btnLogoutNav);
        
        // Global Event Delegation for Dynamic Elements
        document.addEventListener('change', async (e) => {
            if (e.target) {
                if (e.target.id === 'admDashLine') {
                    console.log('Line changed (delegated):', e.target.value);
                    await window.updateStyleDropdowns('admDashLine', 'admDashStyle');
                    try { window.loadAdminDash && window.loadAdminDash(); } catch {}
                }
                else if (e.target.id === 'admDashStyle') {
                    try { window.loadAdminDash && window.loadAdminDash(); } catch {}
                }
                else if (e.target.id === 'filterSumLine') {
                    await window.updateStyleDropdowns('filterSumLine', 'filterSumStyle');
                }
            }
        });

        // Removed individual listeners to avoid duplication/stale references
        /*
        const dashLineSel = document.getElementById('admDashLine');
        const dashStyleSel = document.getElementById('admDashStyle');
        if (dashLineSel) dashLineSel.addEventListener('change', async () => { 
            await window.updateStyleDropdowns('admDashLine', 'admDashStyle');
            try { window.loadAdminDash && window.loadAdminDash(); } catch {} 
        });
        if (dashStyleSel) dashStyleSel.addEventListener('change', () => { try { window.loadAdminDash && window.loadAdminDash(); } catch {} });

        const sumLineSel = document.getElementById('filterSumLine');
        if (sumLineSel) sumLineSel.addEventListener('change', async () => {
             await window.updateStyleDropdowns('filterSumLine', 'filterSumStyle');
        });
        */
        
        // Popups (Toggle)
        document.querySelectorAll('.btn-toggle').forEach(btn => {
            btn.onclick = () => {
                const targetId = btn.dataset.target;
                const form = document.getElementById(targetId);
                if (form) {
                    form.style.display = form.style.display === 'none' ? 'block' : 'none';
                }
            };
        });
        
        document.querySelectorAll('.btn-cancel-popup').forEach(btn => {
             btn.onclick = () => {
                 const targetId = btn.dataset.target;
                 const form = document.getElementById(targetId);
                 if (form) {
                     form.style.display = 'none';
                     form.reset();
                     form.dataset.editId = '';
                     form.dataset.entity = '';
                 }
             };
        });

         const formMesin = document.getElementById('formMesin');
         if (formMesin) {
             const catSelect = formMesin.querySelector('select[name="kategori"]');
             if (catSelect) {
                 catSelect.addEventListener('change', window.updateMesinTypes);
             }
         }
 
         const userRoleFilter = document.getElementById('filterUserRole');
         if (userRoleFilter) {
             userRoleFilter.addEventListener('change', () => { loadUsers(); });
         }
         const userSearchInput = document.getElementById('searchUserName');
         if (userSearchInput) {
             userSearchInput.addEventListener('input', () => { loadUsers(); });
         }
 
         const mesinKatFilter = document.getElementById('filterMesinKategori');
         const mesinJenisFilter = document.getElementById('filterMesinJenis');
         const mesinSearch = document.getElementById('searchMesinNoSeri');
         if (mesinKatFilter) {
             mesinKatFilter.addEventListener('change', () => {
                 if (typeof window.refreshMesinFilterOptions === 'function') window.refreshMesinFilterOptions();
                 window.renderMesinTable();
             });
         }
         if (mesinJenisFilter) {
             mesinJenisFilter.addEventListener('change', () => window.renderMesinTable());
         }
         if (mesinSearch) {
             mesinSearch.addEventListener('input', () => window.renderMesinTable());
         }
 
         window.editItem = (entity, id) => {
             let item = null;
             let formId = null;
             if (entity === 'lines') { item = cache.lines.find(x => x.id == id); formId = 'formLine'; }
            if (entity === 'mesin') { 
                item = cache.mesin.find(x => x.id == id); 
                formId = 'formMesin';
                const form = document.getElementById(formId);
                if (form && item) {
                     const applyMesin = () => {
                         Object.keys(item).forEach(k => {
                            const el = form.querySelector(`[name="${k}"]`);
                            if (el) el.value = item[k] == null ? '' : item[k];
                         });
                         // Set temporary value to be picked up by updateMesinTypes
                         const typeSelect = form.querySelector('select[name="jenis"]');
                         if (typeSelect) typeSelect.dataset.value = item.jenis || '';
                         
                         window.updateMesinTypes();
                         
                         // Re-set value to be sure
                         if (typeSelect && item.jenis) typeSelect.value = item.jenis;
                         
                         form.dataset.editId = String(id);
                         form.dataset.entity = entity;
                         form.style.display = 'block';
                     };
                     applyMesin();
                     return;
                }
            }
            if (entity === 'styles') { item = cache.styles.find(x => x.id == id); formId = 'formStyle'; }
            if (entity === 'proses') { 
                const styleSelect = document.getElementById('prosesStyleSelect');
                const sid = styleSelect ? styleSelect.value : null;
                formId = 'formProses';
                const apply = (itm) => {
                    if (!itm) return;
                    const form = document.getElementById(formId);
                    if (!form) return;
                    Object.keys(itm).forEach(k => {
                        const el = form.querySelector(`[name="${k}"]`);
                        if (el) el.value = itm[k] == null ? '' : itm[k];
                    });
                    form.dataset.editId = String(id);
                    form.dataset.entity = entity;
                    form.style.display = 'block';
                };
                if (sid) {
                    fetchJSON(`/api/admin/proses?style_id=${sid}`).then(arr => {
                        const itm = Array.isArray(arr) ? arr.find(x => x.id == id) : null;
                        apply(itm);
                    });
                    return;
                } else {
                    item = (cache.proses || []).find(x => x.id == id);
                    apply(item);
                    return;
                }
            }
            if (entity === 'devices') { item = cache.devices.find(x => x.id == id); formId = 'formDevice'; }
            if (entity === 'users') { item = cache.users.find(x => x.id == id); formId = 'formUser'; }
            if (entity === 'orders') { 
                const o = cache.orders.find(x => x.id == id);
                if (!o) return;
                window.switchOrderTab && window.switchOrderTab('op-breakdown');
                const form = document.getElementById('formOrderPlan');
                if (!form) return;
                const orcSel = document.getElementById('planOrcSelect');
                const lineSel = document.getElementById('planLineSelect');
                const prosesSel = document.getElementById('planProsesSelect');
                const urutanInp = form.querySelector('input[name="urutan"]');
                if (orcSel && cache.styles.length) {
                    setOptions(orcSel, cache.styles, 'id', r => `${r.orc} - ${r.style}`);
                    orcSel.value = o.style_id || '';
                }
                if (lineSel && cache.lines.length) {
                    setOptions(lineSel, cache.lines, 'id', 'nama_line');
                    lineSel.value = o.line_id || '';
                }
                if (prosesSel) {
                    prosesSel.innerHTML = '<option value="">Pilih Proses</option>';
                    if (o.style_id) {
                        fetchJSON(`/api/admin/proses?style_id=${o.style_id}`).then(arr => {
                            if (Array.isArray(arr)) {
                                arr.forEach(p => {
                                    const opt = document.createElement('option');
                                    opt.value = p.id;
                                    opt.textContent = `${p.urutan}. ${p.nama_proses}`;
                                    prosesSel.appendChild(opt);
                                });
                                prosesSel.value = o.proses_id || '';
                            }
                        });
                    }
                }
                if (urutanInp) urutanInp.value = o.urutan || 0;
                return;
            }
            if (!formId || !item) return;
            const form = document.getElementById(formId);
            if (!form) return;
            Object.keys(item).forEach(k => {
                const el = form.querySelector(`[name="${k}"]`);
                if (el) {
                    if (k === 'password') return;
                    el.value = item[k] == null ? '' : item[k];
                }
            });
            form.dataset.editId = String(id);
            form.dataset.entity = entity;
            form.style.display = 'block';
        };
        
        const userForm = document.getElementById('formUser');
        if (userForm) {
            const roleSel = userForm.querySelector('select[name="role"]');
            const lineSel = userForm.querySelector('select[name="line_id"]');
            const updateLineField = () => {
                const r = roleSel ? roleSel.value : '';
                const isUser = r === 'user';
                if (lineSel) {
                    lineSel.disabled = false;
                    if (isUser) {
                        lineSel.setAttribute('required', 'required');
                    } else {
                        lineSel.removeAttribute('required');
                    }
                }
            };
            if (roleSel) {
                roleSel.addEventListener('change', updateLineField);
                updateLineField();
            }
        }

        loadAll();
    });


    // --- New Order Tab Logic ---

    window.setupOrderTabLogic = function() {
        if (window.orderTabsInitialized) return;
        
        const tabs = document.querySelectorAll('.tab-btn');
        const contents = document.querySelectorAll('.tab-content');
        
        if (!tabs.length) return;
        
        window.orderTabsInitialized = true;
      
        // Tab Switching
        window.switchOrderTab = (tabName) => {
          tabs.forEach(t => {
            const active = t.dataset.tab === tabName;
            t.classList.toggle('active', active);
            t.style.borderBottom = active ? '2px solid var(--primary)' : 'none';
            t.style.fontWeight = active ? 'bold' : 'normal';
          });
          contents.forEach(c => {
            c.style.display = c.id === `tab-${tabName}` ? 'block' : 'none';
          });
          if (tabName === 'summary') loadOrder();
        }
      
        tabs.forEach(t => {
          t.onclick = (e) => {
            e.preventDefault();
            window.switchOrderTab(t.dataset.tab);
          }
        });
      
        // Form Logic
        const form = document.getElementById('formOrderPlan');
        if (!form) return;
        
        // Avoid duplicate listeners
        if (form.dataset.ready) return;
        form.dataset.ready = "1";
      
        // Populate Dropdowns
        const orcSel = document.getElementById('planOrcSelect');
        const lineSel = document.getElementById('planLineSelect');
        const prosesSel = document.getElementById('planProsesSelect');
        const katSel = document.getElementById('planKategoriSelect');
        const jenisSel = document.getElementById('planJenisSelect');
        
        if (orcSel) {
          setOptions(orcSel, cache.styles || [], 'id', (r) => `${r.orc} - ${r.style}`);
          
          if (lineSel) {
              lineSel.addEventListener('change', async () => {
                  const lid = lineSel.value;
                  // Reset process dropdown
                  if (prosesSel) prosesSel.innerHTML = '<option value="">Pilih Proses</option>';
                  
                  if (!lid) {
                      setOptions(orcSel, cache.styles || [], 'id', (r) => `${r.orc} - ${r.style}`);
                      return;
                  }
                  try {
                      const res = await fetchJSON(`/api/iot/styles_by_line?line_id=${lid}&_t=${Date.now()}`);
                      let activeStyles = Array.isArray(res) ? res : [];
                      // Strict Filter: Ensure data belongs to this line (Paranoid Check)
                      activeStyles = activeStyles.filter(r => !r.line_id || String(r.line_id) === String(lid));

                      if (activeStyles.length > 0) {
                          const uniqueIds = [...new Set(activeStyles.map(s => s.style_id || s.id))];
                          const filtered = (cache.styles || []).filter(s => uniqueIds.includes(s.id));
                          setOptions(orcSel, filtered, 'id', (r) => `${r.orc} - ${r.style}`);
                      } else {
                          orcSel.innerHTML = '<option value="">Pilih ORC</option>';
                      }
                  } catch (e) { console.error(e); }
              });
          }

          orcSel.addEventListener('change', async () => {
            const styleId = orcSel.value;
            prosesSel.innerHTML = '<option value="">Pilih Proses</option>';
            if (styleId) {
              const proses = await fetchJSON(`/api/admin/proses?style_id=${styleId}`);
              if (Array.isArray(proses)) {
                  proses.forEach(p => {
                      const opt = document.createElement('option');
                      opt.value = p.id;
                      opt.textContent = `${p.urutan}. ${p.nama_proses}`;
                      prosesSel.appendChild(opt);
                  });
              }
            }
          });
        }
        
        if (lineSel) {
           setOptions(lineSel, cache.lines || [], 'id', 'nama_line');
        }
      
        // Kategori & Jenis (from cache.mesin)
        if (katSel) {
            const uniqueKat = [...new Set((cache.mesin || []).map(m => m.kategori).filter(Boolean))].sort();
            uniqueKat.forEach(k => {
                const opt = document.createElement('option');
                opt.value = k;
                opt.textContent = k;
                katSel.appendChild(opt);
            });
            
            katSel.addEventListener('change', () => {
                const k = katSel.value;
                jenisSel.innerHTML = '<option value="">Pilih Jenis</option>';
                if (k) {
                    const uniqueJenis = [...new Set((cache.mesin || []).filter(m => m.kategori === k).map(m => m.jenis).filter(Boolean))].sort();
                    uniqueJenis.forEach(j => {
                        const opt = document.createElement('option');
                        opt.value = j;
                        opt.textContent = j;
                        jenisSel.appendChild(opt);
                    });
                }
            });
        }
      
        // Handle Submit
        form.onsubmit = async (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          const plan = Object.fromEntries(fd.entries());
          
          if (!plan.orc || !plan.line_id || !plan.proses_id || !plan.kategori_mesin || !plan.jenis_mesin || !plan.jumlah) {
              alert('Mohon lengkapi semua data');
              return;
          }
          
          window.currentOrderPlan = plan;
          await renderDeviceAssignment();
          window.switchOrderTab('device-assign');
        };
        
        // Setup Device Assignment Save Button
        const btnSave = document.getElementById('btnSaveAssignments');
        if (btnSave) {
            btnSave.onclick = async () => {
                const rows = document.querySelectorAll('.assign-row');
                const assignments = [];
                
                for (const row of rows) {
                    const mid = row.querySelector('.assign-mesin').value;
                    const tid = row.querySelector('.assign-tx').value;
                    if (!mid) {
                        alert('Setiap baris harus memiliki mesin yang dipilih');
                        return;
                    }
                    assignments.push({ mesin_id: mid, transmitter_id: tid });
                }
                
                if (!assignments.length) return;
                
                if (!confirm(`Buat ${assignments.length} order?`)) return;
                
                const plan = window.currentOrderPlan;
                const style = cache.styles.find(s => s.id == plan.orc);
                
                try {
                    let successCount = 0;
                    for (const a of assignments) {
                        const payload = {
                    orc: style ? style.orc : '',
                    line_id: parseInt(plan.line_id),
                    style_id: parseInt(plan.orc),
                    proses_id: parseInt(plan.proses_id),
                    mesin_id: parseInt(a.mesin_id),
                    transmitter_id: a.transmitter_id ? parseInt(a.transmitter_id) : null,
                    urutan: plan.urutan ? parseInt(plan.urutan) : 0
                };
                        
                        const res = await fetchJSON('/api/admin/orders', {
                            method: 'POST',
                            body: JSON.stringify(payload)
                        });
                        
                        if (res && !res.error) successCount++;
                    }
                    
                    alert(`Berhasil membuat ${successCount} order.`);
                    form.reset();
                    const assignContainer = document.getElementById('deviceAssignList');
                    if (assignContainer) assignContainer.innerHTML = '';
                    window.currentOrderPlan = null;
                    await loadOrder();
                    window.switchOrderTab('summary');
                } catch (err) {
                    alert('Terjadi kesalahan: ' + err.message);
                }
            };
        }
    };
      
    window.renderDeviceAssignment = async function() {
        const plan = window.currentOrderPlan;
        const container = document.getElementById('deviceAssignList');
        if (!plan || !container) return;
        
        container.innerHTML = '<p>Memuat data...</p>';
        
        // Refresh Data
        await Promise.all([loadMesin(), loadDevice(), loadOrder()]); // Ensure cache is fresh
        
        const usedMesinIds = new Set(cache.orders.filter(o => o.status === 'aktif' && o.mesin_id).map(o => o.mesin_id));
        const availableMesin = cache.mesin.filter(m => 
            m.kategori === plan.kategori_mesin && 
            m.jenis === plan.jenis_mesin && 
            !usedMesinIds.has(m.id)
        );
        
        const usedTxIds = new Set(cache.orders.filter(o => o.status === 'aktif' && o.transmitter_id).map(o => o.transmitter_id));
        const availableTx = cache.devices.filter(d => 
            d.tipe === 'transmitter' && 
            d.status === 'aktif' && 
            !usedTxIds.has(d.id)
        );
        
        container.innerHTML = '';
        const count = parseInt(plan.jumlah);
        
        if (availableMesin.length < count) {
            const msg = document.createElement('div');
            msg.style.color = 'red';
            msg.style.marginBottom = '1rem';
            msg.textContent = `Peringatan: Hanya tersedia ${availableMesin.length} mesin untuk kriteria ini, namun anda meminta ${count}.`;
            container.appendChild(msg);
        }
      
        for (let i = 0; i < count; i++) {
            const row = document.createElement('div');
            row.className = 'assign-row';
            row.style.display = 'grid';
            row.style.gridTemplateColumns = '1fr 1fr';
            row.style.gap = '1rem';
            row.style.padding = '1rem';
            row.style.border = '1px solid #eee';
            row.style.background = '#f9f9f9';
            
            // Mesin Select
            const mSel = document.createElement('select');
            mSel.className = 'assign-mesin';
            mSel.innerHTML = '<option value="">Pilih Mesin</option>';
            availableMesin.forEach(m => {
                mSel.innerHTML += `<option value="${m.id}">${m.no_seri || m.nama} (${m.merk})</option>`;
            });
            
            // Auto-select if possible
            if (availableMesin[i]) {
                mSel.value = availableMesin[i].id;
            }
      
            // Tx Select
            const tSel = document.createElement('select');
            tSel.className = 'assign-tx';
            tSel.innerHTML = '<option value="">Pilih Transmitter (Opsional)</option>';
            availableTx.forEach(t => {
                tSel.innerHTML += `<option value="${t.id}">${t.nama} (${t.tx_code || '-'})</option>`;
            });
      
            const labelM = document.createElement('label');
            labelM.textContent = `Mesin #${i+1}`;
            const divM = document.createElement('div');
            divM.appendChild(labelM);
            divM.appendChild(mSel);
            
            const labelT = document.createElement('label');
            labelT.textContent = `Transmitter`;
            const divT = document.createElement('div');
            divT.appendChild(labelT);
            divT.appendChild(tSel);
            
            row.appendChild(divM);
            row.appendChild(divT);
            container.appendChild(row);
        }
    };

// --- Clock Logic ---
    window.initAdminClock = function() {
      const clockEl = document.getElementById('adminClock');
      if (!clockEl) return;
      
      function tick() {
        const now = new Date();
        clockEl.textContent = now.toLocaleString('id-ID');
      }
      
      tick();
      setInterval(tick, 1000);
    };

    // Initialize
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        if (window.loadAll) window.loadAll();
        window.initAdminClock();
      });
    } else {
      if (window.loadAll) window.loadAll();
      window.initAdminClock();
    }
  })();
