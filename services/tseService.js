const fs = require('fs');
const path = require('path');

const CITIES_FILE = path.join(__dirname, '..', 'data', 'cities.json');

class TseService {
  constructor() {
    this.ano = '2026';
    this.eleicaoFederal = '6257';  // Presidente (BR)
    this.eleicaoEstadual = '6259'; // Deputados, Senador, Governador (SP e outros estados)
    
    // In-memory cache for API requests
    this.cache = new Map();
    this.cacheTTL = 10000; // 10 seconds TTL

    // Live cached data structures
    this.liveStatusSP = null;
    this.liveCasal22 = null;
    this.liveCidades = [];
    this.lastCityUpdate = 0;
    this.isUpdatingCities = false;

    this.loadBaseCities();
    
    // Initial fetch of live data
    this.refreshLiveTseData().catch(err => console.error('Erro na carga inicial TSE:', err.message));

    // Background poller every 15 seconds to keep TSE data warm
    setInterval(() => {
      this.refreshLiveTseData().catch(err => console.error('Erro no poller TSE:', err.message));
    }, 15000);
  }

  loadBaseCities() {
    try {
      this.baseCities = JSON.parse(fs.readFileSync(CITIES_FILE, 'utf8'));
    } catch (err) {
      console.error('Erro ao ler cities.json:', err);
      this.baseCities = [];
    }
  }

  normalizeStr(str) {
    if (!str) return '';
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  async fetchTseJson(url) {
    const cached = this.cache.get(url);
    const now = Date.now();
    if (cached && (now - cached.timestamp < this.cacheTTL)) {
      return cached.data;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7000);
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
          'Accept': 'application/json'
        },
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        this.cache.set(url, { timestamp: now, data });
        return data;
      }
      console.warn(`TSE HTTP ${res.status} para URL: ${url}`);
      return cached ? cached.data : null;
    } catch (err) {
      console.warn(`Erro na requisição TSE (${url}):`, err.message);
      return cached ? cached.data : null;
    }
  }

  // Extrai lista plana de candidatos do JSON unificado do TSE
  extractCandidates(data, cargoKey, uf, eleicaoCodigo) {
    const list = [];
    if (!data || !data.carg || !data.carg[0] || !data.carg[0].agr) return list;

    const ufLower = (uf || 'sp').toLowerCase();
    for (const agr of data.carg[0].agr) {
      if (!agr.par) continue;
      for (const par of agr.par) {
        const partidoSigla = par.sg || '';
        const partidoNome = par.nm || '';
        if (!par.cand) continue;

        for (const c of par.cand) {
          const votosNum = parseInt(c.vap || '0', 10) || 0;
          const pvapFloat = parseFloat((c.pvap || '0,00').replace(',', '.')) || 0;

          // Foto oficial TSE
          let fotoUrl = `https://resultados.tse.jus.br/oficial/ele2026/${eleicaoCodigo}/fotos/${ufLower}/${c.sqcand}.jpeg`;
          if (c.n === '2200') {
            fotoUrl = '/fotos/capitao.png';
          } else if (c.n === '22322') {
            fotoUrl = '/fotos/dani.png';
          }

          let situacaoTexto = c.st || '';
          if (c.e === 's' && !situacaoTexto) situacaoTexto = 'Eleito por QP';
          if (!situacaoTexto) {
            situacaoTexto = votosNum > 0 ? 'Em apuração' : 'Registrado (Aguardando votos)';
          }

          list.push({
            numero: c.n,
            sqcand: c.sqcand,
            nome: c.nm,
            nomeUrna: c.nmu || c.nm,
            partido: partidoSigla,
            partidoNome: partidoNome,
            votos: votosNum,
            percentual: pvapFloat,
            percentualStr: c.pvap || '0,00',
            eleito: c.e === 's',
            situacao: situacaoTexto,
            foto: fotoUrl,
            cargo: cargoKey,
            uf: uf.toUpperCase(),
            isDestaque: c.n === '2200' || c.n === '22322'
          });
        }
      }
    }

    // Ordena decrescente por votos
    list.sort((a, b) => b.votos - a.votos);
    list.forEach((c, idx) => {
      c.posicao = idx + 1;
    });

    return list;
  }

  // Atualiza todos os dados de São Paulo e das 25 cidades prioritárias
  async refreshLiveTseData() {
    try {
      // 1. Apuração Geral SP e Deputado Federal SP (contém Capitão Augusto)
      const urlFedSP = `https://resultados.tse.jus.br/oficial/ele2026/${this.eleicaoEstadual}/dados/sp/sp-c0006-e006259-u.json`;
      // 2. Deputado Estadual SP (contém Dani Alonso)
      const urlEstSP = `https://resultados.tse.jus.br/oficial/ele2026/${this.eleicaoEstadual}/dados/sp/sp-c0007-e006259-u.json`;

      const [dataFedSP, dataEstSP] = await Promise.all([
        this.fetchTseJson(urlFedSP),
        this.fetchTseJson(urlEstSP)
      ]);

      if (dataFedSP && dataFedSP.s) {
        const secTot = parseInt(dataFedSP.s.ts || '103656', 10);
        const secApur = parseInt(dataFedSP.s.st || '0', 10);
        const pctApur = dataFedSP.s.pst || '0,00';
        const vv = parseInt(dataFedSP.v?.vv || '0', 10);
        const vb = parseInt(dataFedSP.v?.vb || '0', 10);
        const vn = parseInt(dataFedSP.v?.vn || '0', 10);
        const comparecimento = parseInt(dataFedSP.v?.tv || '0', 10);

        this.liveStatusSP = {
          modo: 'live',
          ano: '2026',
          uf: 'SP',
          fase: secApur > 0 ? 'apuracao' : 'aguardando',
          totalizacao: {
            secoesTotalizadas: pctApur,
            secoesApuradas: secApur,
            totalSecoes: secTot,
            totalEleitores: 34667793,
            votosValidos: vv,
            brancos: vb,
            nulos: vn,
            comparecimento: comparecimento,
            abstencoes: 0
          },
          ultimaAtualizacao: dataFedSP.hg || new Date().toLocaleTimeString('pt-BR'),
          dataGeracao: dataFedSP.dg || new Date().toLocaleDateString('pt-BR'),
          fonte: 'TSE Oficial 2026 (Resultados em Tempo Real)'
        };
      }

      // Extrai candidatos SP
      const federalCandidates = this.extractCandidates(dataFedSP, 'deputadoFederal', 'SP', this.eleicaoEstadual);
      const estadualCandidates = this.extractCandidates(dataEstSP, 'deputadoEstadual', 'SP', this.eleicaoEstadual);

      // Capitão Augusto (2200)
      const capitaoCand = federalCandidates.find(c => c.numero === '2200') || {
        numero: '2200',
        nomeUrna: 'CAPITÃO AUGUSTO',
        partido: 'PL',
        votos: 0,
        percentual: 0,
        posicao: 1,
        situacao: 'Registrado (Aguardando votos)'
      };

      // Dani Alonso (22322)
      const daniCand = estadualCandidates.find(c => c.numero === '22322') || {
        numero: '22322',
        nomeUrna: 'DANI ALONSO',
        partido: 'PL',
        votos: 0,
        percentual: 0,
        posicao: 1,
        situacao: 'Registrada (Aguardando votos)'
      };

      // 3. Atualizar cidades em background
      await this.updateLiveCities();

      // Top Cidades apuradas
      const topCapitao = [...this.liveCidades]
        .sort((a, b) => b.capitaoAugusto.votos - a.capitaoAugusto.votos)
        .slice(0, 5)
        .map(c => ({
          cidade: c.nome,
          votos: c.capitaoAugusto.votos,
          percentual: c.capitaoAugusto.percentual,
          posicao: c.capitaoAugusto.posicao
        }));

      const topDani = [...this.liveCidades]
        .sort((a, b) => b.daniAlonso.votos - a.daniAlonso.votos)
        .slice(0, 5)
        .map(c => ({
          cidade: c.nome,
          votos: c.daniAlonso.votos,
          percentual: c.daniAlonso.percentual,
          posicao: c.daniAlonso.posicao
        }));

      this.liveCasal22 = {
        capitaoAugusto: {
          nome: capitaoCand.nome || 'JOSE AUGUSTO ROSA',
          nomeUrna: capitaoCand.nomeUrna || 'CAPITÃO AUGUSTO',
          numero: '2200',
          partido: 'PL',
          votos: capitaoCand.votos,
          percentual: capitaoCand.percentual,
          posicao: capitaoCand.posicao,
          situacao: capitaoCand.situacao,
          foto: '/fotos/capitao.png',
          cargo: 'Deputado Federal',
          uf: 'SP',
          topCidades: topCapitao
        },
        daniAlonso: {
          nome: daniCand.nome || 'DANIELE MAZUQUELI ALONSO ROSA',
          nomeUrna: daniCand.nomeUrna || 'DANI ALONSO',
          numero: '22322',
          partido: 'PL',
          votos: daniCand.votos,
          percentual: daniCand.percentual,
          posicao: daniCand.posicao,
          situacao: daniCand.situacao,
          foto: '/fotos/dani.png',
          cargo: 'Deputada Estadual',
          uf: 'SP',
          topCidades: topDani
        },
        cidades: this.liveCidades
      };

    } catch (err) {
      console.error('Erro ao atualizar dados live TSE:', err);
    }
  }

  // Atualiza as 25 cidades consultando os arquivos municipais oficiais do TSE
  async updateLiveCities() {
    if (this.isUpdatingCities) return;
    this.isUpdatingCities = true;

    try {
      const cidadesAtualizadas = [];
      const chunkSize = 5;

      for (let i = 0; i < this.baseCities.length; i += chunkSize) {
        const chunk = this.baseCities.slice(i, i + chunkSize);
        const results = await Promise.all(chunk.map(async (baseCity) => {
          const cod = baseCity.codigoTse;
          const uFed = `https://resultados.tse.jus.br/oficial/ele2026/${this.eleicaoEstadual}/dados/sp/sp${cod}-c0006-e006259-u.json`;
          const uEst = `https://resultados.tse.jus.br/oficial/ele2026/${this.eleicaoEstadual}/dados/sp/sp${cod}-c0007-e006259-u.json`;

          const [dFed, dEst] = await Promise.all([
            this.fetchTseJson(uFed),
            this.fetchTseJson(uEst)
          ]);

          let capVotos = 0;
          let capPct = 0;
          let capPos = 1;

          let daniVotos = 0;
          let daniPct = 0;
          let daniPos = 1;

          let secoesTot = baseCity.totalEleitores ? Math.round(baseCity.totalEleitores / 350) : 100;
          let secoesApur = 0;
          let pctApurado = '0,00';
          let votosValidosCidade = 0;

          if (dFed && dFed.s) {
            secoesTot = parseInt(dFed.s.ts || '0', 10);
            secoesApur = parseInt(dFed.s.st || '0', 10);
            pctApurado = dFed.s.pst || '0,00';
            votosValidosCidade = parseInt(dFed.v?.vv || '0', 10);

            // Buscar Capitão Augusto na cidade
            const candListFed = [];
            if (dFed.carg && dFed.carg[0] && dFed.carg[0].agr) {
              for (const a of dFed.carg[0].agr) {
                if (!a.par) continue;
                for (const p of a.par) {
                  if (!p.cand) continue;
                  for (const c of p.cand) {
                    candListFed.push({ n: c.n, v: parseInt(c.vap || '0', 10), pv: c.pvap || '0,00' });
                  }
                }
              }
            }
            candListFed.sort((a, b) => b.v - a.v);
            const capItem = candListFed.find(c => c.n === '2200');
            if (capItem) {
              capVotos = capItem.v;
              capPct = parseFloat(capItem.pv.replace(',', '.')) || 0;
              const idx = candListFed.findIndex(c => c.n === '2200');
              capPos = idx >= 0 ? idx + 1 : 1;
            }
          }

          if (dEst && dEst.carg && dEst.carg[0] && dEst.carg[0].agr) {
            const candListEst = [];
            for (const a of dEst.carg[0].agr) {
              if (!a.par) continue;
              for (const p of a.par) {
                if (!p.cand) continue;
                for (const c of p.cand) {
                  candListEst.push({ n: c.n, v: parseInt(c.vap || '0', 10), pv: c.pvap || '0,00' });
                }
              }
            }
            candListEst.sort((a, b) => b.v - a.v);
            const daniItem = candListEst.find(c => c.n === '22322');
            if (daniItem) {
              daniVotos = daniItem.v;
              daniPct = parseFloat(daniItem.pv.replace(',', '.')) || 0;
              const idx = candListEst.findIndex(c => c.n === '22322');
              daniPos = idx >= 0 ? idx + 1 : 1;
            }
          }

          return {
            id: baseCity.id,
            nome: baseCity.nome,
            regiao: baseCity.regiao,
            codigoTse: baseCity.codigoTse,
            totalEleitores: baseCity.totalEleitores || 0,
            secoesTotalizadas: parseFloat(pctApurado.replace(',', '.')) || 0,
            secoesTotalizadasStr: pctApurado,
            secoesApuradas: secoesApur,
            totalSecoes: secoesTot,
            votosValidos: votosValidosCidade,
            capitaoAugusto: {
              votos: capVotos,
              percentual: capPct,
              posicao: capPos
            },
            daniAlonso: {
              votos: daniVotos,
              percentual: daniPct,
              posicao: daniPos
            }
          };
        }));

        cidadesAtualizadas.push(...results);
      }

      this.liveCidades = cidadesAtualizadas;
      this.lastCityUpdate = Date.now();
    } catch (err) {
      console.error('Erro ao atualizar cidades live do TSE:', err);
    } finally {
      this.isUpdatingCities = false;
    }
  }

  getStatus() {
    if (this.liveStatusSP) {
      return this.liveStatusSP;
    }

    return {
      modo: 'live',
      ano: '2026',
      uf: 'SP',
      fase: 'aguardando',
      totalizacao: {
        secoesTotalizadas: '0,00',
        secoesApuradas: 0,
        totalSecoes: 103656,
        totalEleitores: 34667793,
        votosValidos: 0,
        brancos: 0,
        nulos: 0,
        abstencoes: 0,
        comparecimento: 0
      },
      ultimaAtualizacao: new Date().toLocaleTimeString('pt-BR'),
      fonte: 'TSE Oficial 2026 (Conectando...)'
    };
  }

  getDestaqueCasal22() {
    if (this.liveCasal22) {
      return this.liveCasal22;
    }

    // Estrutura inicial enquanto carrega
    return {
      capitaoAugusto: {
        nome: 'JOSE AUGUSTO ROSA',
        nomeUrna: 'CAPITÃO AUGUSTO',
        numero: '2200',
        partido: 'PL',
        votos: 0,
        percentual: 0,
        posicao: 1,
        situacao: 'Registrado (Aguardando votos)',
        foto: '/fotos/capitao.png',
        cargo: 'Deputado Federal',
        uf: 'SP',
        topCidades: []
      },
      daniAlonso: {
        nome: 'DANIELE MAZUQUELI ALONSO ROSA',
        nomeUrna: 'DANI ALONSO',
        numero: '22322',
        partido: 'PL',
        votos: 0,
        percentual: 0,
        posicao: 1,
        situacao: 'Registrada (Aguardando votos)',
        foto: '/fotos/dani.png',
        cargo: 'Deputada Estadual',
        uf: 'SP',
        topCidades: []
      },
      cidades: this.liveCidades
    };
  }

  getCidades(busca = '', ordenarPor = 'capitao_votos', ordem = 'desc', regiao = 'todas') {
    let lista = [...this.liveCidades];

    if (busca && busca.trim()) {
      const q = this.normalizeStr(busca.trim());
      lista = lista.filter(c =>
        this.normalizeStr(c.nome).includes(q) ||
        this.normalizeStr(c.regiao).includes(q) ||
        (c.codigoTse && c.codigoTse.includes(q))
      );
    }

    if (regiao && regiao !== 'todas') {
      lista = lista.filter(c => c.regiao.toLowerCase() === regiao.toLowerCase());
    }

    lista.sort((a, b) => {
      let valA, valB;
      switch (ordenarPor) {
        case 'capitao_votos':
          valA = a.capitaoAugusto.votos;
          valB = b.capitaoAugusto.votos;
          break;
        case 'capitao_pct':
          valA = a.capitaoAugusto.percentual;
          valB = b.capitaoAugusto.percentual;
          break;
        case 'dani_votos':
          valA = a.daniAlonso.votos;
          valB = b.daniAlonso.votos;
          break;
        case 'dani_pct':
          valA = a.daniAlonso.percentual;
          valB = b.daniAlonso.percentual;
          break;
        case 'nome':
          return ordem === 'asc' ? a.nome.localeCompare(b.nome) : b.nome.localeCompare(a.nome);
        default:
          valA = a.capitaoAugusto.votos;
          valB = b.capitaoAugusto.votos;
      }
      return ordem === 'asc' ? valA - valB : valB - valA;
    });

    return lista;
  }

  async getCandidatosPorCargo(cargo = 'deputadoFederal', busca = '', partido = 'todos', uf = 'SP') {
    const cargoNorm = this.normalizeCargoKey(cargo);
    let targetUf = (uf || 'SP').toLowerCase();
    let eleicaoCodigo = this.eleicaoEstadual;
    let url = '';

    if (cargoNorm === 'presidente') {
      // Eleição Federal 6257 em âmbito nacional
      eleicaoCodigo = this.eleicaoFederal;
      targetUf = 'br';
      url = `https://resultados.tse.jus.br/oficial/ele2026/${eleicaoCodigo}/dados/br/br-c0001-e006257-u.json`;
    } else {
      // Eleição Estadual 6259
      eleicaoCodigo = this.eleicaoEstadual;
      if (targetUf === 'br' || !targetUf) targetUf = 'sp'; // Padrão SP para cargos estaduais/federais

      const cargoCodigoMap = {
        'deputadoFederal': 'c0006',
        'deputadoEstadual': targetUf === 'df' ? 'c0008' : 'c0007',
        'governador': 'c0003',
        'senador': 'c0005'
      };

      const codigoCargo = cargoCodigoMap[cargoNorm] || 'c0006';
      url = `https://resultados.tse.jus.br/oficial/ele2026/${eleicaoCodigo}/dados/${targetUf}/${targetUf}-${codigoCargo}-e006259-u.json`;
    }

    const tseData = await this.fetchTseJson(url);
    let list = this.extractCandidates(tseData, cargoNorm, targetUf, eleicaoCodigo);

    if (busca && busca.trim()) {
      const q = this.normalizeStr(busca.trim());
      list = list.filter(c =>
        this.normalizeStr(c.nome).includes(q) ||
        this.normalizeStr(c.nomeUrna).includes(q) ||
        c.numero.includes(q) ||
        this.normalizeStr(c.partido).includes(q)
      );
    }

    if (partido && partido !== 'todos') {
      list = list.filter(c => c.partido.toUpperCase() === partido.toUpperCase());
    }

    return list;
  }

  normalizeCargoKey(cargo) {
    const map = {
      'deputadoFederal': 'deputadoFederal',
      'federal': 'deputadoFederal',
      'c0006': 'deputadoFederal',
      'deputadoEstadual': 'deputadoEstadual',
      'estadual': 'deputadoEstadual',
      'c0007': 'deputadoEstadual',
      'c0008': 'deputadoEstadual',
      'presidente': 'presidente',
      'c0001': 'presidente',
      'governador': 'governador',
      'c0003': 'governador',
      'senador': 'senador',
      'c0005': 'senador'
    };
    return map[cargo] || 'deputadoFederal';
  }
}

module.exports = new TseService();
