const express = require('express');
const cors = require('cors');
const path = require('path');
const tseService = require('./services/tseService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Servir fotos customizadas diretamente
app.use('/fotos', express.static(path.join(__dirname, 'public', 'fotos')));

// API Routes 100% Real TSE
app.get('/api/status', (req, res) => {
  try {
    const status = tseService.getStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/destaque', (req, res) => {
  try {
    const destaque = tseService.getDestaqueCasal22();
    res.json(destaque);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/cidades', (req, res) => {
  try {
    const { busca, ordenarPor, ordem, regiao } = req.query;
    const cidades = tseService.getCidades(busca, ordenarPor, ordem, regiao);
    res.json({
      total: cidades.length,
      cidades
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/candidatos', async (req, res) => {
  try {
    const { cargo, busca, partido, uf } = req.query;
    const candidatos = await tseService.getCandidatosPorCargo(cargo, busca, partido, uf);
    res.json({
      cargo: cargo || 'deputadoFederal',
      uf: uf || 'SP',
      total: candidatos.length,
      candidatos
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/refresh', async (req, res) => {
  try {
    await tseService.refreshLiveTseData();
    res.json({ success: true, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fallback to index.html for SPA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🇧🇷 SISTEMA OFICIAL DE APURAÇÃO TSE 2026`);
  console.log(`🏛️ Destaque: Capitão Augusto & Dani Alonso`);
  console.log(`🌐 Servidor rodando em: http://localhost:${PORT}`);
  console.log(`📡 Conexão direta com resultados.tse.jus.br`);
  console.log(`====================================================`);
});
