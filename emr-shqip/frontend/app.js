const API = 'http://localhost:3001/api';
let token = localStorage.getItem('emr_token');
let currentUser = JSON.parse(localStorage.getItem('emr_user') || '{}');
let selectedPlan = { name: 'pro', amount: 65 };

// 🛠️ INIT PAS NGARKIMIT TË DOM
document.addEventListener('DOMContentLoaded', () => {
  initEMRUI();
  
  // ✅ Lidh butonat e planeve me modal-in e pagesës
  document.querySelectorAll('.btn-price').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const plan = btn.dataset.plan;
      const amount = parseFloat(btn.dataset.amount);
      openPayment(plan, amount);
    });
  });
  
  // Mobile Menu
  document.querySelectorAll('.menu-btn, .menu-toggle').forEach(b => {
    b?.addEventListener('click', toggleSidebar);
  });
  document.getElementById('overlay')?.addEventListener('click', closeSidebar);
  
  // Auth Tabs
  document.querySelectorAll('.auth-tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tabs .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const type = tab.dataset.tab;
      document.getElementById('login-form').classList.toggle('hidden', type !== 'login');
      document.getElementById('register-form').classList.toggle('hidden', type !== 'register');
    });
  });
  
  // Register Flow
  document.getElementById('reg-next-btn')?.addEventListener('click', () => {
    const e = document.getElementById('reg-email')?.value;
    const p = document.getElementById('reg-pass')?.value;
    if(!e || !p) return document.getElementById('reg-msg').textContent = 'Plotëso të dyja fushat';
    if(p.length < 6) return document.getElementById('reg-msg').textContent = 'Min. 6 karaktere';
    document.getElementById('show-email').textContent = e;
    document.getElementById('reg-step-1').classList.add('hidden');
    document.getElementById('reg-step-2').classList.remove('hidden');
  });
  
  document.getElementById('reg-prev-btn')?.addEventListener('click', () => {
    document.getElementById('reg-step-1').classList.remove('hidden');
    document.getElementById('reg-step-2').classList.add('hidden');
  });
  
  // Form Submits
  document.getElementById('login-form')?.addEventListener('submit', handleLogin);
  document.getElementById('register-form')?.addEventListener('submit', handleRegister);
  document.getElementById('process-pay-btn')?.addEventListener('click', processPayment);
  // ✅ HEQUR: btn-to-marketing (nuk e duam më)
  document.getElementById('go-back-to-plans')?.addEventListener('click', () => showView('landing-page'));
  document.getElementById('btn-logout')?.addEventListener('click', logout);
  document.querySelector('.close-modal')?.addEventListener('click', closePayment);
  
  // Load remembered email
  const saved = localStorage.getItem('emr_saved_email');
  if(saved && document.getElementById('login-email')) {
    document.getElementById('login-email').value = saved;
  }
  
  // ✅ AUTO-LOGIN: Nëse ka token → hap Dashboard, përndryshe → hap Marketing (default)
  if(token) {
    try {
      const u = JSON.parse(localStorage.getItem('emr_user') || '{}');
      if(u?.id) { 
        currentUser = u; 
        showView('app-container'); // ✅ Pas login → Dashboard
        loadDashboard(); 
      } else { 
        showView('landing-page'); // Default: Marketing
      }
    } catch { 
      showView('landing-page'); // Default: Marketing
    }
  } else {
    showView('landing-page'); // ✅ DEFAULT: Hap Marketing kur nuk ka token
  }
});

// 👁️ VIEW MANAGEMENT
function showView(id) {
  ['landing-page', 'auth-screen', 'access-denied', 'app-container'].forEach(v => {
    const el = document.getElementById(v);
    if(!el) return;
    if(v === id) { 
      el.classList.remove('hidden'); 
      el.classList.add('active'); 
    } else { 
      el.classList.add('hidden'); 
      el.classList.remove('active'); 
    }
  });
  closePayment();
  if(id === 'app-container') {
    document.getElementById('sidebar')?.classList.remove('closed');
  }
}

function toggleSidebar() { 
  document.getElementById('sidebar')?.classList.toggle('open'); 
  document.getElementById('overlay')?.classList.toggle('active'); 
}

function closeSidebar() { 
  document.getElementById('sidebar')?.classList.remove('open'); 
  document.getElementById('overlay')?.classList.remove('active'); 
}

function logout() { 
  localStorage.removeItem('emr_token'); 
  localStorage.removeItem('emr_user'); 
  token = null; 
  currentUser = {}; 
  showView('landing-page'); // Pas logout → Marketing
}

// 💳 PAYMENT FLOW
function openPayment(plan, amount) {
  const durations = { basic: '1 muaj', pro: '3 muaj', enterprise: '1 vit' };
  selectedPlan = { name: plan, amount, duration: durations[plan] };
  
  document.getElementById('pay-plan').textContent = plan.charAt(0).toUpperCase() + plan.slice(1);
  document.getElementById('pay-duration').textContent = selectedPlan.duration;
  document.getElementById('pay-total').textContent = amount.toFixed(2) + ' €';
  
  const modal = document.getElementById('payment-modal');
  modal.classList.remove('hidden');
  void modal.offsetWidth; // Force reflow
  modal.classList.add('active');
  
  document.getElementById('pay-msg').textContent = '';
  document.getElementById('pay-msg').className = 'msg';
}

function closePayment() { 
  const modal = document.getElementById('payment-modal');
  if(!modal.classList.contains('hidden')) {
    modal.classList.remove('active');
    setTimeout(() => modal.classList.add('hidden'), 250);
  }
}

async function processPayment() {
  const msg = document.getElementById('pay-msg');
  const emailInput = document.getElementById('reg-email')?.value?.trim() || 
                     document.getElementById('login-email')?.value?.trim();
  const email = emailInput || prompt("Shkruaj emailin për të lidhur abonimin:");
  
  if(!email) { 
    msg.textContent = '⚠️ Email-i është i detyrueshëm'; 
    msg.className = 'msg error'; 
    return; 
  }
  
  if(!document.getElementById('agree-terms')?.checked) { 
    msg.textContent = '⚠️ Prano kushtet e përdorimit'; 
    msg.className = 'msg error'; 
    return; 
  }
  
  msg.textContent = '⏳ Duke përpunuar pagesën...'; 
  msg.className = 'msg';

  try {
    const res = await fetch(`${API}/subscribe`, {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.toLowerCase(), 
        plan: selectedPlan.name, 
        amount: parseFloat(selectedPlan.amount) || 0,
        payment_method: document.querySelector('input[name="payment"]:checked')?.value || 'card'
      })
    });
    
    const contentType = res.headers.get('content-type');
    if(!contentType || !contentType.includes('application/json')) {
      throw new Error('Serveri ktheu përgjigje të pavlefshme');
    }
    
    const d = await res.json();
    
    if(!res.ok) {
      if(d.error?.includes('User-i nuk u gjet')) {
        throw new Error('Ky email nuk është i regjistruar. Regjistrohu së pari.');
      }
      throw new Error(d.error || 'Diçka shkoi gabim');
    }
    
    msg.textContent = '✅ Pagesa u pranua! Po të ridrejtojmë te login...'; 
    msg.className = 'msg success';
    
    setTimeout(() => { 
      closePayment(); 
      showView('auth-screen'); // Pas pagesës → Login
    }, 1200);
    
  } catch(e) {
    console.error('❌ Gabim në pagesë:', e);
    if(e.message === 'Failed to fetch') {
      msg.textContent = '❌ Serveri nuk po punon. Sigurohu që `node server.js` po ecën në backend.';
    } else if(e.message.includes('CORS')) {
      msg.textContent = '❌ Gabim CORS. Kontrollo që backend-i lejon kërkesa nga frontend-i.';
    } else {
      msg.textContent = '❌ Gabim: ' + e.message;
    }
    msg.className = 'msg error';
  }
}

// 🔐 AUTH HANDLERS
async function handleLogin(e) {
  e.preventDefault();
  const msg = document.getElementById('login-msg'); 
  msg.textContent = 'Duke u kyçur...'; 
  msg.className = 'msg';
  
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-pass').value;
  
  if(!email || !password) {
    msg.textContent = 'Plotëso email dhe fjalëkalim';
    msg.className = 'msg error';
    return;
  }
  
  try {
    const res = await fetch(`${API}/login`, {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ identifier: email, password })
    });
    
    const contentType = res.headers.get('content-type');
    if(!contentType || !contentType.includes('application/json')) {
      throw new Error('Përgjigje e pavlefshme nga serveri');
    }
    
    const d = await res.json();
    
    if(!res.ok) { 
      if(d.needsSubscription) { 
        msg.textContent = 'Abonimi ka skaduar. Bli një plan për të hyrë.'; 
        msg.className = 'msg error'; 
        setTimeout(() => showView('access-denied'), 1500); 
        return; 
      } 
      throw new Error(d.error || 'Email ose fjalëkalim i gabim'); 
    }
    
    token = d.token; 
    currentUser = d.user; 
    localStorage.setItem('emr_token', token); 
    localStorage.setItem('emr_user', JSON.stringify(d.user));
    localStorage.setItem('emr_saved_email', email);
    
    msg.textContent = '✅ U kyçe me sukses!'; 
    msg.className = 'msg success';
    
    showView('app-container'); // ✅ Pas login → Dashboard
    loadDashboard();
    
  } catch(err) { 
    console.error('❌ Gabim në login:', err);
    msg.textContent = err.message === 'Failed to fetch' 
      ? '❌ Serveri nuk po punon. Kontrollo backend-in.' 
      : '❌ ' + err.message; 
    msg.className = 'msg error'; 
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const msg = document.getElementById('reg-msg'); 
  msg.textContent = 'Duke u regjistruar...'; 
  msg.className = 'msg';
  
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-pass').value;
  const username = document.getElementById('reg-username')?.value?.trim() || email.split('@')[0];
  
  if(!email || !password) {
    msg.textContent = 'Plotëso email dhe fjalëkalim';
    msg.className = 'msg error';
    return;
  }
  if(password.length < 6) {
    msg.textContent = 'Fjalëkalimi duhet të ketë së paku 6 karaktere';
    msg.className = 'msg error';
    return;
  }

  try {
    const res = await fetch(`${API}/register`, {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ email: email.toLowerCase(), password, username })
    });
    
    const d = await res.json(); 
    if(!res.ok) throw new Error(d.error || 'Gabim gjatë regjistrimit');
    
    msg.textContent = '✅ Regjistrimi i suksesshëm! Tani kyçu.'; 
    msg.className = 'msg success';
    
    setTimeout(() => { 
      document.getElementById('login-email').value = email;
      showView('auth-screen'); 
    }, 2000);
    
  } catch(err) { 
    console.error('❌ Gabim në regjistrim:', err);
    msg.textContent = err.message === 'Failed to fetch'
      ? '❌ Serveri nuk po punon. Kontrollo backend-in.'
      : '❌ ' + err.message; 
    msg.className = 'msg error'; 
  }
}

// 🌐 EMR APP MODULES
function initEMRUI() {
  const modules = [
    {id:'dashboard', icon:'📊', label:'Paneli'},
    {id:'patients', icon:'👥', label:'Patientët'},
    {id:'doctors', icon:'👨‍⚕️', label:'Mjekët'},
    {id:'appointments', icon:'📅', label:'Takimet'},
    {id:'visits', icon:'🩺', label:'Vizitat'},
    {id:'prescriptions', icon:'💊', label:'Recetat'},
    {id:'billing', icon:'🧾', label:'Faturimi'},
    {id:'notifications', icon:'🔔', label:'Njoftimet'},
    {id:'crm', icon:'🤝', label:'CRM'}
  ];
  
  document.getElementById('nav-list').innerHTML = modules.map(m => 
    `<div class="nav-item-app ${m.id==='dashboard'?'active':''}" data-page="${m.id}">${m.icon} ${m.label}</div>`
  ).join('');
  
  document.getElementById('sections-container').innerHTML = modules.map(m => 
    `<div id="${m.id}" class="section ${m.id==='dashboard'?'active':''}">${buildModule(m.id)}</div>`
  ).join('');
  
  document.querySelectorAll('.nav-item-app').forEach(el => {
    el.addEventListener('click', () => navigateTo(el.dataset.page));
  });
}

function buildModule(id) {
  if(id === 'dashboard') return `
    <div class="card-app"><div class="card-body-app"><h3>Statistikat</h3>
    <div class="grid-stats" style="margin-top:1rem">
      <div class="stat-box"><div class="val" id="d-p">0</div><div style="font-size:.9rem;margin-top:.25rem">Patientë</div></div>
      <div class="stat-box"><div class="val" id="d-a">0</div><div style="font-size:.9rem;margin-top:.25rem">Takime</div></div>
      <div class="stat-box"><div class="val" id="d-i">0</div><div style="font-size:.9rem;margin-top:.25rem">Fatura</div></div>
      <div class="stat-box"><div class="val" id="d-n">0</div><div style="font-size:.9rem;margin-top:.25rem">Njoftime</div></div>
    </div>
    <h4 style="margin:1.25rem 0 .75rem">📋 Aktivitetet</h4><ul id="d-logs" style="padding-left:1.2rem;color:var(--text-light)"></ul></div></div>`;
  
  const fields = {
    patients: ['first_name','last_name','date_of_birth','gender','contact_phone'],
    doctors: ['first_name','last_name','specialization','license_number'],
    appointments: ['patient_id','doctor_id','appointment_date','reason_for_visit'],
    visits: ['patient_id','doctor_id','appointment_id','diagnosis'],
    prescriptions: ['patient_id','doctor_id','medication_name','dosage','instructions'],
    billing: ['patient_id','amount','status']
  }[id] || [];
  
  const tableHeaders = fields.map(x => `<th>${x.replace(/_/g, ' ')}</th>`).join('') + '<th>Veprime</th>';
  const formInputs = fields.map(x => `<input type="text" id="${id}-${x}" placeholder="${x.replace(/_/g, ' ')}" class="form-input">`).join('');
  
  return `
    <div class="card-app">
      <div class="card-body-app">
        <h3>Shto në ${id}</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:.75rem;margin:.5rem 0">
          ${formInputs}
        </div>
        <button class="btn-app" onclick="shto('${id}')" style="margin-top:.5rem">💾 Ruaj</button>
        <div class="table-wrap">
          <table>
            <thead><tr>${tableHeaders}</tr></thead>
            <tbody id="${id}-table"></tbody>
          </table>
        </div>
      </div>
    </div>`;
}

function navigateTo(id) {
  document.querySelectorAll('.nav-item-app').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelector(`.nav-item-app[data-page="${id}"]`)?.classList.add('active');
  document.getElementById(id)?.classList.add('active');
  document.getElementById('page-title').textContent = document.querySelector(`.nav-item-app[data-page="${id}"]`)?.textContent || id;
  if(window.innerWidth <= 1024) closeSidebar();
  if(id !== 'dashboard') loadData(id);
}

// 🌐 API CALLS
async function api(path, method = 'GET', body = null) {
  const opts = { 
    method, 
    headers: { 
      'Authorization': `Bearer ${token}`, 
      'Content-Type': 'application/json' 
    } 
  };
  if(body) opts.body = JSON.stringify(body);
  
  const res = await fetch(`${API}${path}`, opts);
  
  if(res.status === 401 || res.status === 403) { 
    logout(); 
    throw new Error('Sesion skadoi ose abonimi mungon'); 
  }
  
  const contentType = res.headers.get('content-type');
  if(!contentType || !contentType.includes('application/json')) {
    throw new Error('Përgjigje e pavlefshme nga serveri');
  }
  
  return res.json();
}

async function loadData(mod) {
  try {
    if(mod === 'dashboard') await loadDashboard();
    else if(mod === 'notifications' || mod === 'crm') {
      const d = await api(`/${mod}`);
      const list = document.getElementById(`${mod}-table`);
      if(list) {
        list.innerHTML = (d || []).map(r => `
          <tr>
            <td>${r.id || '-'}</td>
            <td>${r.title || r.patient || r.type || '-'}</td>
            <td>${r.desc || r.notes || '-'}</td>
            <td><button class="btn-app btn-outline" style="padding:.2rem .4rem;font-size:.75rem">👁️</button></td>
          </tr>
        `).join('');
      }
    } else {
      const d = await api(`/${mod}`); 
      renderTable(mod, d);
    }
  } catch(e) { 
    console.error(`❌ Gabim në ngarkimin e ${mod}:`, e); 
  }
}

async function loadDashboard() {
  try {
    const d = await api('/dashboard');
    document.getElementById('d-p').textContent = d.metrics?.patients || 0;
    document.getElementById('d-a').textContent = d.metrics?.appointments || 0;
    document.getElementById('d-i').textContent = d.metrics?.unpaid_bills || 0;
    document.getElementById('d-logs').innerHTML = d.recent?.map(r => 
      `<li style="margin-bottom:.5rem">${r.action || r.titulli} - ${r.desc || r.mesazhi} 
      <span style="color:#999;font-size:.8rem;display:block">${new Date(r.time || r.data_krijimit).toLocaleString('sq')}</span></li>`
    ).join('') || '<li>Nuk ka aktivitete</li>';
  } catch(e) {
    console.error('❌ Gabim në dashboard:', e);
  }
}

function renderTable(mod, list) {
  const tbody = document.getElementById(`${mod}-table`); 
  if(!tbody) return;
  
  tbody.innerHTML = (list || []).map(r => `
    <tr>
      ${Object.values(r).slice(1).map(v => `<td>${v != null ? v : '-'}</td>`).join('')}
      <td><button class="btn-app btn-outline" style="padding:.2rem .4rem;font-size:.75rem">👁️</button></td>
    </tr>
  `).join('');
}

async function shto(mod) {
  const fields = document.querySelectorAll(`[id^="${mod}-"]`); 
  let body = {};
  
  fields.forEach(f => { 
    if(f.value?.trim()) body[f.id.replace(`${mod}-`, '')] = f.value.trim(); 
  });
  
  if(!Object.keys(body).length) return alert('Plotëso të paktën një fushë');
  
  try { 
    await api(`/${mod}`, 'POST', body); 
    alert('✅ U ruajt me sukses!'); 
    loadData(mod); 
    fields.forEach(f => f.value = ''); 
  } catch(e) { 
    alert('Gabim: ' + (e.message === 'Failed to fetch' ? 'Serveri nuk po punon' : e.message)); 
  }
}