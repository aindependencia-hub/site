/*
  Simulador 100% frontend (sem Node/Express).
  Toda a geração/validação/renderização roda no navegador.
*/

const CONST = {
  WALL_EXT: 0.15,
  WALL_INT: 0.125,
  DOOR_W: 0.8,
  DOOR_FOLGA: 0.1,
  MIN_CORR: 1.0,
  MAX_CORR_L: 1.5,
  MIN_DIM: 1.8,
  WIN_QUARTO: 1.1,
  WIN_BANH: 0.5,
};

let seed = Math.floor(Math.random() * 100000);

const ambientesBase = [
  { id: "sala", nome: "Sala", quantidade: 1, areaUnit: 24, setor: "social" },
  { id: "cozinha", nome: "Cozinha", quantidade: 1, areaUnit: 12, setor: "servico" },
  { id: "lavanderia", nome: "Lavanderia", quantidade: 1, areaUnit: 6, setor: "servico" },
  { id: "garagem", nome: "Garagem", quantidade: 1, areaUnit: 14, setor: "servico" },
  { id: "suite_master", nome: "Suíte", quantidade: 1, areaUnit: 16, setor: "privado" },
  { id: "quarto", nome: "Quarto", quantidade: 1, areaUnit: 12, setor: "privado" },
  { id: "banheiro", nome: "Banheiro", quantidade: 1, areaUnit: 5, setor: "privado" },
];

function lcg(v) {
  let s = (v ^ 0x9e3779b9) >>> 0;
  return () => {
    s = (Math.imul(0x41c64e6d, s) + 0x3039) >>> 0;
    return s / 0x100000000;
  };
}

function expandir(ambientes) {
  const out = [];
  for (const a of ambientes) {
    for (let i = 0; i < a.quantidade; i++) {
      out.push({
        instanceId: `${a.id}_${i}`,
        nome: a.quantidade > 1 ? `${a.nome} ${i + 1}` : a.nome,
        tipo: a.id,
        setor: a.setor,
        areaAlvo: a.areaUnit,
      });
    }
  }
  return out;
}

function packZone(rooms, x, y, w, h, rand) {
  if (!rooms.length) return [];
  const sorted = [...rooms].sort((a, b) => b.areaAlvo - a.areaAlvo);
  const total = sorted.reduce((s, r) => s + r.areaAlvo, 0) || 1;
  let cx = x;
  const out = [];
  for (let i = 0; i < sorted.length; i++) {
    const room = sorted[i];
    const last = i === sorted.length - 1;
    const rw = last ? x + w - cx : Math.max(CONST.MIN_DIM, w * (room.areaAlvo / total) * (0.9 + rand() * 0.2));
    out.push({ instanceId: room.instanceId, x: cx, y, w: rw, h });
    cx += rw;
  }
  return out;
}

function sharedSegment(a, b) {
  const eps = 0.02;
  const over = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);
  if (Math.abs(a.x + a.largura - b.x) < eps) {
    const o = over(a.y, a.y + a.altura, b.y, b.y + b.altura);
    if (o > CONST.DOOR_W + 0.2) return { paredeA: "right", paredeB: "left", seg0: Math.max(a.y, b.y) };
  }
  if (Math.abs(a.x - (b.x + b.largura)) < eps) {
    const o = over(a.y, a.y + a.altura, b.y, b.y + b.altura);
    if (o > CONST.DOOR_W + 0.2) return { paredeA: "left", paredeB: "right", seg0: Math.max(a.y, b.y) };
  }
  if (Math.abs(a.y + a.altura - b.y) < eps) {
    const o = over(a.x, a.x + a.largura, b.x, b.x + b.largura);
    if (o > CONST.DOOR_W + 0.2) return { paredeA: "top", paredeB: "bottom", seg0: Math.max(a.x, b.x) };
  }
  if (Math.abs(a.y - (b.y + b.altura)) < eps) {
    const o = over(a.x, a.x + a.largura, b.x, b.x + b.largura);
    if (o > CONST.DOOR_W + 0.2) return { paredeA: "bottom", paredeB: "top", seg0: Math.max(a.x, b.x) };
  }
  return null;
}

function colocarPorta(rA, rB, parede, seg0) {
  const wall = parede === "left" || parede === "right" ? rA.altura : rA.largura;
  let posInicio = (parede === "left" || parede === "right") ? seg0 - rA.y + CONST.DOOR_FOLGA : seg0 - rA.x + CONST.DOOR_FOLGA;
  const maxPos = wall - CONST.DOOR_W - CONST.DOOR_FOLGA;
  posInicio = Math.max(CONST.DOOR_FOLGA, Math.min(maxPos, posInicio));
  const cPorta = posInicio + CONST.DOOR_W / 2;
  if (Math.abs(cPorta - wall / 2) < 0.2) posInicio = cPorta < wall / 2 ? CONST.DOOR_FOLGA : maxPos;

  rA.portas.push({ parede, posInicio, largura: CONST.DOOR_W, abrePara: rB.instanceId });
  if (!rA.conexoes.includes(rB.instanceId)) rA.conexoes.push(rB.instanceId);
  if (!rB.conexoes.includes(rA.instanceId)) rB.conexoes.push(rA.instanceId);
}

function gerarLayout(ambientes, terreno, semente) {
  const rand = lcg(semente);
  const buildW = Math.max(4, terreno.largura - terreno.recuoLateral * 2);
  const buildH = Math.max(6, terreno.profundidade - terreno.recuoFrontal - terreno.recuoFundo);
  const buildX = terreno.recuoLateral;
  const buildY = terreno.recuoFrontal;

  const base = expandir(ambientes);
  const sala = base.find((r) => r.tipo === "sala");
  const serv = base.filter((r) => ["cozinha", "lavanderia", "garagem"].includes(r.tipo));
  const priv = base.filter((r) => ["suite_master", "quarto", "banheiro"].includes(r.tipo));

  const salaH = Math.max(3.5, Math.min(7.5, (sala?.areaAlvo || 24) / buildW));
  const backY = salaH;
  const backH = buildH - backY;
  const serviceW = Math.max(3, buildW * 0.45);
  const privadoW = buildW - serviceW;

  const pos = new Map();
  if (sala) pos.set(sala.instanceId, { x: 0, y: 0, w: buildW, h: salaH });
  for (const p of packZone(serv, 0, backY, serviceW, backH, rand)) pos.set(p.instanceId, p);
  for (const p of packZone(priv, serviceW, backY, privadoW, backH, rand)) pos.set(p.instanceId, p);

  const rooms = base.map((r) => {
    const p = pos.get(r.instanceId);
    if (!p) return null;
    const ext = [];
    if (p.x <= 0.05) ext.push("left");
    if (p.y <= 0.05) ext.push("bottom");
    if (Math.abs(p.x + p.w - buildW) < 0.05) ext.push("right");
    if (Math.abs(p.y + p.h - buildH) < 0.05) ext.push("top");
    const room = {
      ...r,
      x: p.x,
      y: p.y,
      largura: p.w,
      altura: p.h,
      portas: [],
      janelas: [],
      conexoes: [],
      paredesExternas: ext,
    };
    if (["quarto", "suite_master"].includes(room.tipo) && ext.length) {
      const parede = ext[0];
      const len = parede === "left" || parede === "right" ? room.altura : room.largura;
      if (len > CONST.WIN_QUARTO + 0.4) room.janelas.push({ parede, largura: CONST.WIN_QUARTO, posInicio: (len - CONST.WIN_QUARTO) / 2 });
    }
    if (room.tipo === "banheiro" && ext.length) {
      const parede = ext[0];
      const len = parede === "left" || parede === "right" ? room.altura : room.largura;
      if (len > CONST.WIN_BANH + 0.4) room.janelas.push({ parede, largura: CONST.WIN_BANH, posInicio: (len - CONST.WIN_BANH) / 2 });
    }
    return room;
  }).filter(Boolean);

  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i], b = rooms[j];
      const seg = sharedSegment(a, b);
      if (!seg) continue;
      if ((a.tipo === "sala" && b.tipo === "cozinha") || (a.tipo === "cozinha" && b.tipo === "sala")) {
        a.conexoes.push(b.instanceId);
        b.conexoes.push(a.instanceId);
      } else {
        colocarPorta(a, b, seg.paredeA, seg.seg0);
        colocarPorta(b, a, seg.paredeB, seg.seg0);
      }
    }
  }

  const corredores = [];
  const circulacaoArea = corredores.reduce((s, c) => s + c.w * c.h, 0);
  const alertas = [];
  rooms.forEach((r) => {
    if (["quarto", "suite_master"].includes(r.tipo) && !r.janelas.length) alertas.push(`${r.nome} sem janela válida.`);
    if (r.tipo === "banheiro" && !r.janelas.length) alertas.push(`${r.nome} sem janela obrigatória.`);
  });

  return {
    terrenoW: terreno.largura,
    terrenoH: terreno.profundidade,
    buildX,
    buildY,
    buildW,
    buildH,
    rooms,
    corredores,
    entradaX: buildX + buildW / 2,
    circulacaoArea,
    circulacaoPercentual: circulacaoArea / (buildW * buildH),
    alertas,
  };
}

function render(layout) {
  const canvas = document.getElementById("plantaCanvas");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const pad = 35;
  const scale = Math.min((canvas.width - 2 * pad) / layout.terrenoW, (canvas.height - 2 * pad) / layout.terrenoH);
  const mx = (x) => pad + x * scale;
  const my = (y) => canvas.height - pad - y * scale;

  ctx.fillStyle = "#d9d6ce";
  ctx.fillRect(mx(0), my(layout.terrenoH), layout.terrenoW * scale, layout.terrenoH * scale);

  ctx.fillStyle = "#f9f8f4";
  ctx.fillRect(mx(layout.buildX), my(layout.buildY + layout.buildH), layout.buildW * scale, layout.buildH * scale);

  const cores = { social: "#edf6f0", privado: "#edf0f8", servico: "#f7ede0" };
  for (const r of layout.rooms) {
    const x = layout.buildX + r.x;
    const y = layout.buildY + r.y;

    ctx.fillStyle = cores[r.setor] || "#eee";
    ctx.fillRect(mx(x), my(y + r.altura), r.largura * scale, r.altura * scale);
    ctx.strokeStyle = "#2a2620";
    ctx.lineWidth = 1.4;
    ctx.strokeRect(mx(x), my(y + r.altura), r.largura * scale, r.altura * scale);

    // Fonte fixa em todos os cômodos (requisito obrigatório)
    ctx.fillStyle = "#1f1f1f";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "600 11px Inter, Arial, sans-serif";
    ctx.fillText(r.nome, mx(x) + (r.largura * scale) / 2, my(y + r.altura) + (r.altura * scale) / 2);
  }
}

function lerTerreno() {
  return {
    largura: Number(document.getElementById("terrenoW").value),
    profundidade: Number(document.getElementById("terrenoH").value),
    recuoFrontal: Number(document.getElementById("recuoFrontal").value),
    recuoFundo: Number(document.getElementById("recuoFundo").value),
    recuoLateral: Number(document.getElementById("recuoLateral").value),
    larguraCirculacao: Number(document.getElementById("larguraCirculacao").value),
  };
}

function atualizarAlertas(alertas) {
  const ul = document.getElementById("alertas");
  ul.innerHTML = "";
  if (!alertas.length) {
    const li = document.createElement("li");
    li.textContent = "Nenhum alerta crítico.";
    ul.appendChild(li);
    return;
  }
  alertas.forEach((a) => {
    const li = document.createElement("li");
    li.textContent = a;
    ul.appendChild(li);
  });
}

function gerar() {
  const terreno = lerTerreno();
  const layout = gerarLayout(ambientesBase, terreno, seed);
  render(layout);
  atualizarAlertas(layout.alertas);
}

document.getElementById("gerarBtn").addEventListener("click", gerar);
document.getElementById("novaSeedBtn").addEventListener("click", () => {
  seed = Math.floor(Math.random() * 100000);
  gerar();
});

gerar();
