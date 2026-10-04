// Application State - Eleições 2026 (100% Real TSE)
const state = {
  status: null,
  destaque: null,
  cidades: [],
  candidatos: [],
  filtros: {
    buscaCidade: '',
    regiao: 'todas',
    ordenarCidades: 'capitao_votos',
    cargo: 'deputadoFederal',
    buscaCandidato: '',
    partido: 'todos',
    uf: 'SP',
    mostrarTodos: false
  },
  refreshCountdown: 15,
  refreshInterval: null,
  isRefreshing: false
};

// Utilities
const fmtNum = (n) => (n !== undefined && n !== null ? Number(n).toLocaleString('pt-BR') : '0');
const fmtPct = (p) => (p !== undefined && p !== null ? Number(p).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%' : '0,00%');
const normalizeStr = (s) => (s ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() : '');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  startAutoRefresh();
  loadAllData();
});

// Event Listeners
function setupEventListeners() {
  // Manual Refresh
  document.getElementById('btn-refresh')?.addEventListener('click', () => {
    manualRefresh();
  });

  // City Search
  const inputBuscaCidade = document.getElementById('input-busca-cidade');
  const btnLimparBusca = document.getElementById('btn-limpar-busca');
  inputBuscaCidade?.addEventListener('input', (e) => {
    state.filtros.buscaCidade = e.target.value.trim();
    if (btnLimparBusca) {
      btnLimparBusca.classList.toggle('hidden', !e.target.value);
    }
    renderCidades();
  });

  btnLimparBusca?.addEventListener('click', () => {
    if (inputBuscaCidade) {
      inputBuscaCidade.value = '';
      state.filtros.buscaCidade = '';
      btnLimparBusca.classList.add('hidden');
      renderCidades();
    }
  });

  // Region Filters
  document.querySelectorAll('.btn-regiao-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-regiao-filter').forEach(b => {
        b.classList.remove('active', 'bg-patriota-verde', 'text-white');
        b.classList.add('bg-slate-100', 'text-slate-700');
      });
      btn.classList.add('active', 'bg-patriota-verde', 'text-white');
      btn.classList.remove('bg-slate-100', 'text-slate-700');

      state.filtros.regiao = btn.getAttribute('data-regiao') || 'todas';
      renderCidades();
    });
  });

  // Sort Cities
  const selectOrdenar = document.getElementById('select-ordenar-cidades');
  selectOrdenar?.addEventListener('change', (e) => {
    state.filtros.ordenarCidades = e.target.value;
    renderCidades();
  });

  // Candidate Role Tabs
  document.querySelectorAll('.btn-cargo-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-cargo-tab').forEach(b => {
        b.classList.remove('active', 'bg-patriota-verde', 'text-white');
        b.classList.add('bg-white', 'text-slate-700');
      });
      btn.classList.add('active', 'bg-patriota-verde', 'text-white');
      btn.classList.remove('bg-white', 'text-slate-700');

      const novoCargo = btn.getAttribute('data-cargo') || 'deputadoFederal';
      state.filtros.cargo = novoCargo;
      state.filtros.mostrarTodos = false;

      // Se mudar para presidente, ajusta label para Brasil
      const lbl = document.getElementById('label-scope-status');
      if (lbl) {
        if (novoCargo === 'presidente') {
          lbl.innerHTML = `Visualizando: <strong class="text-slate-800">Brasil Inteiro (12 Candidatos a Presidente)</strong>`;
        } else {
          lbl.innerHTML = `Visualizando: <strong class="text-slate-800">Estado: ${state.filtros.uf || 'SP'}</strong>`;
        }
      }

      loadCandidatos();
    });
  });

  // Candidate Search
  document.getElementById('input-busca-candidato')?.addEventListener('input', (e) => {
    state.filtros.buscaCandidato = e.target.value.trim();
    renderCandidatos();
  });

  // Scope / UF Filter (Brasil Inteiro vs Estados)
  const selectUfCompleto = document.getElementById('select-uf-completo');
  document.querySelectorAll('.btn-uf-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-uf-filter').forEach(b => {
        b.classList.remove('active', 'bg-patriota-azul', 'text-white');
        b.classList.add('bg-slate-100', 'text-slate-700');
      });
      btn.classList.add('active', 'bg-patriota-azul', 'text-white');
      btn.classList.remove('bg-slate-100', 'text-slate-700');

      if (selectUfCompleto) selectUfCompleto.value = '';

      const uf = btn.getAttribute('data-uf') || 'SP';
      state.filtros.uf = uf;
      state.filtros.mostrarTodos = false;

      const lbl = document.getElementById('label-scope-status');
      if (lbl) {
        lbl.innerHTML = `Visualizando: <strong class="text-slate-800">${uf === 'BR' ? 'Brasil Inteiro (Nacional)' : 'Estado: ' + uf}</strong>`;
      }

      loadCandidatos();
    });
  });

  selectUfCompleto?.addEventListener('change', (e) => {
    const uf = e.target.value;
    if (!uf) return;

    document.querySelectorAll('.btn-uf-filter').forEach(b => {
      b.classList.remove('active', 'bg-patriota-azul', 'text-white');
      b.classList.add('bg-slate-100', 'text-slate-700');
    });

    state.filtros.uf = uf;
    state.filtros.mostrarTodos = false;
    const lbl = document.getElementById('label-scope-status');
    if (lbl) {
      lbl.innerHTML = `Visualizando: <strong class="text-slate-800">Estado: ${uf}</strong>`;
    }
    loadCandidatos();
  });

  // Party Filters
  document.querySelectorAll('.btn-partido-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-partido-filter').forEach(b => {
        b.classList.remove('active', 'bg-slate-800', 'text-white');
        b.classList.add('bg-white', 'text-slate-700');
      });
      btn.classList.add('active', 'bg-slate-800', 'text-white');
      btn.classList.remove('bg-white', 'text-slate-700');

      state.filtros.partido = btn.getAttribute('data-partido') || 'todos';
      renderCandidatos();
    });
  });
}

// Data Loaders
async function loadAllData() {
  await Promise.all([
    loadStatus(),
    loadDestaque(),
    loadCandidatos()
  ]);
}

async function loadStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    state.status = data;
    renderStatus();
  } catch (err) {
    console.error('Erro ao carregar status:', err);
  }
}

async function loadDestaque() {
  try {
    const res = await fetch('/api/destaque');
    const data = await res.json();
    state.destaque = data;
    state.cidades = data.cidades || [];
    renderDestaque();
    renderCidades();
  } catch (err) {
    console.error('Erro ao carregar destaque:', err);
  }
}

async function loadCandidatos() {
  try {
    const { cargo, uf } = state.filtros;
    const res = await fetch(`/api/candidatos?cargo=${cargo}&uf=${uf || 'SP'}`);
    const data = await res.json();
    state.candidatos = data.candidatos || [];
    renderCandidatos();
  } catch (err) {
    console.error('Erro ao carregar candidatos:', err);
  }
}

// Render Functions
function renderStatus() {
  if (!state.status) return;
  const { totalizacao, ultimaAtualizacao, fonte } = state.status;

  const pctSecoes = totalizacao?.secoesTotalizadas || '0,00';
  const pctNum = parseFloat(String(pctSecoes).replace(',', '.')) || 0;

  document.getElementById('header-secoes-percent').textContent = `${pctSecoes}%`;
  document.getElementById('header-secoes-bar').style.width = `${pctNum}%`;

  const mobSec = document.getElementById('mobile-secoes-percent');
  const mobBar = document.getElementById('mobile-secoes-bar');
  if (mobSec) mobSec.textContent = `${pctSecoes}%`;
  if (mobBar) mobBar.style.width = `${pctNum}%`;

  document.getElementById('stat-eleitores').textContent = fmtNum(totalizacao?.totalEleitores || 34667793);
  document.getElementById('stat-validos').textContent = fmtNum(totalizacao?.votosValidos || 0);
  document.getElementById('stat-update-time').textContent = ultimaAtualizacao || '--:--:--';
  
  const fonteBadge = document.getElementById('header-fonte-badge');
  if (fonteBadge) {
    fonteBadge.textContent = fonte || `Fonte Oficial: TSE`;
  }
}

function renderDestaque() {
  if (!state.destaque) return;
  const { capitaoAugusto, daniAlonso } = state.destaque;

  // Capitão Augusto
  if (capitaoAugusto) {
    document.getElementById('capitao-total-votos').textContent = fmtNum(capitaoAugusto.votos);
    document.getElementById('capitao-percent-votos').textContent = fmtPct(capitaoAugusto.percentual);

    const badgeCap = document.getElementById('badge-situacao-capitao');
    if (badgeCap) {
      if (capitaoAugusto.votos > 0) {
        badgeCap.textContent = capitaoAugusto.situacao || 'EM APURAÇÃO';
      } else {
        badgeCap.textContent = 'REGISTRADO NO TSE (AO VIVO)';
      }
    }

    // Top cidades do Capitão (Destaque exclusivo: Assis, Ourinhos, Marília, Bauru)
    const containerTopCap = document.getElementById('capitao-top-cidades');
    if (containerTopCap && capitaoAugusto.topCidades && capitaoAugusto.topCidades.length > 0) {
      containerTopCap.innerHTML = capitaoAugusto.topCidades.map(c => `
        <div class="bg-white p-2 rounded-xl border border-slate-200 text-center shadow-xs">
          <p class="text-slate-600 font-semibold truncate text-xs">${c.cidade}</p>
          <p class="font-black text-patriota-verde text-sm">${fmtNum(c.votos)}</p>
          <p class="text-[10px] text-slate-400 font-bold">${c.votos > 0 ? fmtPct(c.percentual) : '0,00%'}</p>
        </div>
      `).join('');
    } else if (containerTopCap) {
      const cidadesDestaque = ['Assis', 'Ourinhos', 'Marília', 'Bauru'];
      containerTopCap.innerHTML = cidadesDestaque.map(cid => `
        <div class="bg-white p-2 rounded-xl border border-slate-200 text-center shadow-xs">
          <p class="text-slate-600 font-semibold truncate text-xs">${cid}</p>
          <p class="font-black text-patriota-verde text-sm">0</p>
        </div>
      `).join('');
    }
  }

  // Dani Alonso
  if (daniAlonso) {
    document.getElementById('dani-total-votos').textContent = fmtNum(daniAlonso.votos);
    document.getElementById('dani-percent-votos').textContent = fmtPct(daniAlonso.percentual);

    const badgeDani = document.getElementById('badge-situacao-dani');
    if (badgeDani) {
      if (daniAlonso.votos > 0) {
        badgeDani.textContent = daniAlonso.situacao || 'EM APURAÇÃO';
      } else {
        badgeDani.textContent = 'REGISTRADA NO TSE (AO VIVO)';
      }
    }

    // Top cidades da Dani (Destaque exclusivo: Assis, Ourinhos, Marília, Bauru)
    const containerTopDani = document.getElementById('dani-top-cidades');
    if (containerTopDani && daniAlonso.topCidades && daniAlonso.topCidades.length > 0) {
      containerTopDani.innerHTML = daniAlonso.topCidades.map(c => `
        <div class="bg-white p-2 rounded-xl border border-slate-200 text-center shadow-xs">
          <p class="text-slate-600 font-semibold truncate text-xs">${c.cidade}</p>
          <p class="font-black text-patriota-azul text-sm">${fmtNum(c.votos)}</p>
          <p class="text-[10px] text-slate-400 font-bold">${c.votos > 0 ? fmtPct(c.percentual) : '0,00%'}</p>
        </div>
      `).join('');
    } else if (containerTopDani) {
      const cidadesDestaque = ['Assis', 'Ourinhos', 'Marília', 'Bauru'];
      containerTopDani.innerHTML = cidadesDestaque.map(cid => `
        <div class="bg-white p-2 rounded-xl border border-slate-200 text-center shadow-xs">
          <p class="text-slate-600 font-semibold truncate text-xs">${cid}</p>
          <p class="font-black text-patriota-azul text-sm">0</p>
        </div>
      `).join('');
    }
  }
}

function renderCidades() {
  const container = document.getElementById('cidades-list-container');
  if (!container) return;

  let lista = [...state.cidades];
  const { buscaCidade, regiao, ordenarCidades } = state.filtros;

  // Filtragem por busca
  if (buscaCidade) {
    const q = normalizeStr(buscaCidade);
    lista = lista.filter(c => 
      normalizeStr(c.nome).includes(q) || 
      normalizeStr(c.regiao).includes(q) ||
      (c.codigoTse && c.codigoTse.includes(q))
    );
  }

  // Filtragem por região ou destaque
  const DESTAQUE_CIDADES = ['Assis', 'Ourinhos', 'Marília', 'Bauru'];
  if (regiao && regiao !== 'todas') {
    if (regiao === 'destaque') {
      lista = lista.filter(c => DESTAQUE_CIDADES.map(n => n.toLowerCase()).includes(c.nome.toLowerCase()));
    } else {
      lista = lista.filter(c => normalizeStr(c.regiao) === normalizeStr(regiao));
    }
  }

  // Ordenação (colocando cidades em destaque sempre com prioridade se ordenado por padrão)
  lista.sort((a, b) => {
    switch (ordenarCidades) {
      case 'capitao_votos':
        return b.capitaoAugusto.votos - a.capitaoAugusto.votos;
      case 'capitao_pct':
        return b.capitaoAugusto.percentual - a.capitaoAugusto.percentual;
      case 'dani_votos':
        return b.daniAlonso.votos - a.daniAlonso.votos;
      case 'dani_pct':
        return b.daniAlonso.percentual - a.daniAlonso.percentual;
      case 'nome':
        return a.nome.localeCompare(b.nome);
      default:
        return b.capitaoAugusto.votos - a.capitaoAugusto.votos;
    }
  });

  const countBadge = document.getElementById('stat-cidades-count');
  if (countBadge) countBadge.textContent = `${lista.length} municípios`;

  if (lista.length === 0) {
    container.innerHTML = `
      <div class="p-12 text-center text-slate-400">
        <i class="fa-solid fa-magnifying-glass text-3xl mb-3 text-slate-300"></i>
        <p class="text-base font-bold text-slate-700">Nenhum município encontrado</p>
        <p class="text-xs text-slate-400 mt-1">Verifique o nome digitado ou selecione outra região.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = lista.map((c, index) => {
    const maxVotos = Math.max(c.capitaoAugusto.votos, c.daniAlonso.votos, 1);
    const capPctBar = c.capitaoAugusto.votos > 0 ? (c.capitaoAugusto.votos / maxVotos) * 100 : 0;
    const daniPctBar = c.daniAlonso.votos > 0 ? (c.daniAlonso.votos / maxVotos) * 100 : 0;
    const isDestaque = DESTAQUE_CIDADES.map(n => n.toLowerCase()).includes(c.nome.toLowerCase());

    return `
      <div class="p-4 sm:px-6 hover:bg-slate-50 transition duration-150 ${isDestaque ? 'bg-amber-50/20 border-l-4 border-l-amber-500' : ''}">
        <!-- Desktop Grid View -->
        <div class="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          
          <!-- Cidade e Região -->
          <div class="md:col-span-3 flex items-center gap-3">
            <span class="w-7 h-7 rounded-lg ${isDestaque ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-slate-100 text-slate-600 border-slate-200'} text-xs font-black flex items-center justify-center flex-shrink-0 border">
              ${index + 1}
            </span>
            <div>
              <div class="flex items-center gap-2">
                <h4 class="font-black text-slate-900 text-base hover:text-patriota-verde transition cursor-pointer">
                  ${c.nome}
                </h4>
                ${isDestaque ? `
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-800 border border-amber-300 flex items-center gap-1 shadow-xs">
                    <i class="fa-solid fa-star text-amber-500 text-[9px]"></i> DESTAQUE
                  </span>
                ` : ''}
              </div>
              <p class="text-xs text-slate-500 font-medium">${c.regiao} • Cód. TSE ${c.codigoTse}</p>
            </div>
          </div>

          <!-- Votação Capitão Augusto -->
          <div class="md:col-span-3 bg-emerald-50/40 md:bg-transparent p-3 md:p-0 rounded-xl border border-emerald-100 md:border-none">
            <div class="flex items-center justify-between md:justify-center gap-2">
              <span class="md:hidden text-xs font-bold text-patriota-verde">Capitão Augusto (2200):</span>
              <div class="text-right md:text-center">
                <span class="font-black text-slate-900 text-base">${fmtNum(c.capitaoAugusto.votos)} votos</span>
                <div class="flex items-center justify-end md:justify-center gap-1.5 text-xs text-patriota-verde font-black">
                  <span>${fmtPct(c.capitaoAugusto.percentual)}</span>
                  <span class="text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">${c.capitaoAugusto.votos > 0 ? '#' + c.capitaoAugusto.posicao + ' na cidade' : 'Aguardando urnas'}</span>
                </div>
              </div>
            </div>
            <!-- Progress mini bar -->
            <div class="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1.5">
              <div class="bg-patriota-verde h-full rounded-full transition-all duration-500" style="width: ${capPctBar}%"></div>
            </div>
          </div>

          <!-- Votação Dani Alonso -->
          <div class="md:col-span-3 bg-blue-50/40 md:bg-transparent p-3 md:p-0 rounded-xl border border-blue-100 md:border-none">
            <div class="flex items-center justify-between md:justify-center gap-2">
              <span class="md:hidden text-xs font-bold text-patriota-azul">Dani Alonso (22322):</span>
              <div class="text-right md:text-center">
                <span class="font-black text-slate-900 text-base">${fmtNum(c.daniAlonso.votos)} votos</span>
                <div class="flex items-center justify-end md:justify-center gap-1.5 text-xs text-patriota-azul font-black">
                  <span>${fmtPct(c.daniAlonso.percentual)}</span>
                  <span class="text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">${c.daniAlonso.votos > 0 ? '#' + c.daniAlonso.posicao + ' na cidade' : 'Aguardando urnas'}</span>
                </div>
              </div>
            </div>
            <!-- Progress mini bar -->
            <div class="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1.5">
              <div class="bg-patriota-azul h-full rounded-full transition-all duration-500" style="width: ${daniPctBar}%"></div>
            </div>
          </div>

          <!-- Total Válidos / Seções -->
          <div class="md:col-span-3 flex items-center justify-between md:justify-end gap-3 text-xs">
            <div class="text-left md:text-right">
              <p class="font-bold text-slate-800">${fmtNum(c.votosValidos)} válidos</p>
              <p class="text-slate-400 font-medium">${c.secoesApuradas ? c.secoesApuradas + ' de ' + c.totalSecoes + ' seções' : (c.totalEleitores ? fmtNum(c.totalEleitores) + ' eleitores' : 'Aguardando')}</p>
            </div>
            <span class="px-2.5 py-1 rounded-lg text-xs font-black ${c.secoesTotalizadas >= 100 ? 'bg-emerald-50 text-patriota-verde border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}">
              ${c.secoesTotalizadas}% apurado
            </span>
          </div>

        </div>
      </div>
    `;
  }).join('');
}

function renderCandidatos() {
  const container = document.getElementById('candidatos-list-container');
  if (!container) return;

  let lista = [...state.candidatos];
  const { buscaCandidato, partido } = state.filtros;

  if (buscaCandidato) {
    const q = normalizeStr(buscaCandidato);
    lista = lista.filter(c => 
      normalizeStr(c.nome).includes(q) ||
      normalizeStr(c.nomeUrna).includes(q) ||
      c.numero.includes(q) ||
      normalizeStr(c.partido).includes(q)
    );
  }

  if (partido && partido !== 'todos') {
    lista = lista.filter(c => normalizeStr(c.partido) === normalizeStr(partido));
  }

  if (lista.length === 0) {
    container.innerHTML = `
      <div class="p-12 text-center text-slate-400">
        <i class="fa-solid fa-user-xmark text-3xl mb-3 text-slate-300"></i>
        <p class="text-base font-bold text-slate-700">Nenhum candidato encontrado no TSE</p>
        <p class="text-xs text-slate-400 mt-1">Tente outro nome, número ou selecione outro Estado.</p>
      </div>
    `;
    return;
  }

  const totalEncontrados = lista.length;
  const isBuscando = !!buscaCandidato;
  const limite = (isBuscando || state.filtros.mostrarTodos) ? totalEncontrados : 50;
  const listaExibida = lista.slice(0, limite);

  const lbl = document.getElementById('label-scope-status');
  if (lbl) {
    const ufNome = state.filtros.cargo === 'presidente' ? 'Brasil Inteiro (Nacional)' : 'Estado: ' + (state.filtros.uf || 'SP');
    lbl.innerHTML = `Visualizando: <strong class="text-slate-800">${totalEncontrados} candidatos oficiais TSE (${ufNome})</strong>`;
  }

  const maxVotos = lista.length > 0 ? lista[0].votos : 1;

  let htmlCards = listaExibida.map((c) => {
    const isSpecial = c.isDestaque || c.numero === '2200' || c.numero === '22322';
    const pctBar = (maxVotos > 0 && c.votos > 0) ? (c.votos / maxVotos) * 100 : 0;
    const isElected = c.eleito || (c.situacao && c.situacao.toLowerCase().includes('eleit'));

    return `
      <div class="p-4 sm:px-6 hover:bg-slate-50 transition duration-150 ${isSpecial ? 'bg-emerald-50/30 border-l-4 border-l-patriota-verde' : ''}">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          
          <!-- Rank, Foto Oficial TSE, Nome, Partido -->
          <div class="flex items-center gap-4">
            <span class="w-8 h-8 rounded-xl ${c.posicao <= 3 && c.votos > 0 ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-slate-100 text-slate-600 border border-slate-200'} text-xs font-black flex items-center justify-center flex-shrink-0">
              ${c.votos > 0 ? '#' + c.posicao : '—'}
            </span>

            <div class="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white border-2 ${isSpecial ? 'border-patriota-verde shadow-md' : 'border-slate-200 shadow-xs'} overflow-hidden flex-shrink-0 flex items-center justify-center relative">
              ${c.foto ? `
                <img src="${c.foto}" alt="${c.nomeUrna}" class="w-full h-full object-cover object-top" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'w-full h-full flex items-center justify-center bg-slate-100 font-black text-slate-500 text-xs\\'>${c.nomeUrna ? c.nomeUrna.slice(0, 2).toUpperCase() : 'BR'}</div>';">
              ` : `
                <div class="w-full h-full flex items-center justify-center bg-slate-100 font-black text-slate-500 text-xs">
                  ${c.nomeUrna ? c.nomeUrna.slice(0, 2).toUpperCase() : 'BR'}
                </div>
              `}
              ${isSpecial ? `
                <span class="absolute -bottom-1 -right-1 w-5 h-5 bg-patriota-verde rounded-full flex items-center justify-center text-[10px] text-white shadow-xs">
                  <i class="fa-solid fa-star"></i>
                </span>
              ` : ''}
            </div>

            <div>
              <div class="flex flex-wrap items-center gap-2">
                <h4 class="font-black text-slate-900 text-base ${isSpecial ? 'text-patriota-verde' : ''}">
                  ${c.nomeUrna}
                </h4>
                <span class="px-2 py-0.5 rounded text-xs font-extrabold bg-slate-100 text-slate-700 border border-slate-200">
                  ${c.numero}
                </span>
                ${c.uf ? `
                  <span class="px-2 py-0.5 rounded text-xs font-black bg-blue-50 text-patriota-azul border border-blue-200">
                    ${c.uf}
                  </span>
                ` : ''}
                ${isSpecial ? `
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-patriota-verde border border-emerald-200">
                    DESTAQUE
                  </span>
                ` : ''}
              </div>
              <p class="text-xs text-slate-500 font-medium">
                <span class="font-bold text-slate-700">${c.partido}</span> • ${c.nome}
              </p>
            </div>
          </div>

          <!-- Votos, Percentual e Situação -->
          <div class="flex items-center justify-between sm:justify-end gap-6">
            <div class="text-right">
              <p class="text-base font-black text-slate-900">${fmtNum(c.votos)} votos</p>
              <div class="flex items-center justify-end gap-1.5 text-xs text-slate-500 font-medium">
                <span class="font-black text-patriota-verde">${fmtPct(c.percentual)}</span>
                <span>dos válidos</span>
              </div>
              <div class="w-28 sm:w-36 bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1 ml-auto">
                <div class="bg-gradient-to-r from-patriota-verde to-patriota-amareloOuro h-full rounded-full" style="width: ${pctBar}%"></div>
              </div>
            </div>

            <div class="flex-shrink-0">
              <span class="px-3 py-1 rounded-full text-xs font-black ${isElected ? 'bg-emerald-50 text-patriota-verde border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}">
                ${c.situacao || (isElected ? 'Eleito' : (c.votos > 0 ? 'Em Apuração' : 'Registrado no TSE'))}
              </span>
            </div>
          </div>

        </div>
      </div>
    `;
  }).join('');

  if (totalEncontrados > 50 && !isBuscando && !state.filtros.mostrarTodos) {
    htmlCards += `
      <div class="p-6 text-center bg-slate-50 border-t border-slate-200">
        <button id="btn-mostrar-todos-candidatos" class="px-6 py-2.5 rounded-xl bg-patriota-azul hover:bg-blue-900 text-white font-bold text-xs shadow-xs transition active:scale-95">
          <i class="fa-solid fa-angles-down mr-1.5"></i> Mostrar todos os ${totalEncontrados} candidatos
        </button>
      </div>
    `;
  }

  container.innerHTML = htmlCards;

  document.getElementById('btn-mostrar-todos-candidatos')?.addEventListener('click', () => {
    state.filtros.mostrarTodos = true;
    renderCandidatos();
  });
}

// Auto-Refresh Logic
function startAutoRefresh() {
  if (state.refreshInterval) clearInterval(state.refreshInterval);
  
  state.refreshCountdown = 15;
  const badge = document.getElementById('countdown-badge');

  state.refreshInterval = setInterval(() => {
    state.refreshCountdown -= 1;
    if (badge) badge.textContent = `${state.refreshCountdown}s`;

    if (state.refreshCountdown <= 0) {
      manualRefresh();
      state.refreshCountdown = 15;
    }
  }, 1000);
}

async function manualRefresh() {
  if (state.isRefreshing) return;
  state.isRefreshing = true;

  const icon = document.getElementById('refresh-icon');
  if (icon) icon.classList.add('fa-spin');

  await loadAllData();

  setTimeout(() => {
    if (icon) icon.classList.remove('fa-spin');
    state.isRefreshing = false;
  }, 500);
}
