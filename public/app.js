// PENTA Content Planner — frontend
const STORAGE_KEY = "penta-content-planner-last-client";
let currentClient = null;
let systemStatus = { authEnabled: false, aiEnabled: false };

async function loadSystemStatus() {
  try {
    const r = await fetch("/system/status");
    systemStatus = await r.json();
    const btnIA = document.getElementById("btnIA");
    const hint = document.getElementById("aiHint");
    if (!systemStatus.aiEnabled) {
      btnIA.disabled = true;
      btnIA.title = "Configure ANTHROPIC_API_KEY no .env pra ativar";
      hint.textContent = "⚠️ IA desabilitada — defina ANTHROPIC_API_KEY no .env e reinicie o servidor pra ativar.";
      hint.style.color = "var(--accent-2)";
    }
  } catch {}
}

// =============== LIFECYCLE ===============
async function loadClients() {
  const r = await fetch("/clients");
  const clients = await r.json();
  const sel = document.getElementById("clientSelect");
  sel.innerHTML = "";

  if (!clients.length) {
    document.getElementById("noClient").style.display = "block";
    document.getElementById("clientApp").style.display = "none";
    sel.innerHTML = '<option value="">— sem clientes —</option>';
    return;
  }

  clients.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = `${c.name} (@${c.instagram})`;
    sel.appendChild(opt);
  });

  const last = localStorage.getItem(STORAGE_KEY);
  if (last && clients.some((c) => c.id === last)) sel.value = last;

  await selectClient(sel.value);
}

async function selectClient(id) {
  if (!id) return;
  localStorage.setItem(STORAGE_KEY, id);
  const r = await fetch(`/clients/${id}`);
  currentClient = await r.json();

  document.getElementById("clientApp").style.display = "block";
  document.getElementById("noClient").style.display = "none";

  // Card de info
  const info = document.getElementById("clientInfo");
  info.innerHTML = `
    <b>${currentClient.name}</b> • @${currentClient.instagram}
    ${currentClient.seriesName ? ` • série "${currentClient.seriesName}"` : ""}
    <br>Áreas: ${(currentClient.requiredBalance || []).join(" / ") || "—"}
    ${currentClient.forbiddenTopics?.length ? ` • Proibido: ${currentClient.forbiddenTopics.join(", ")}` : ""}
  `;

  // Descrição editável
  document.getElementById("clientDescription").value = currentClient.description || "";

  // News block visible só se cliente tem newsFeeds
  const hasNews = (currentClient.newsFeeds || []).length > 0;
  document.getElementById("newsBlock").style.display = hasNews ? "block" : "none";
  if (hasNews) document.getElementById("incluirNoticias").checked = true;

  // Formato preferido
  const fmt = document.getElementById("formato");
  if (currentClient.preferredFormats?.length) {
    const map = { "vídeo": "video", "video": "video", "carrossel": "carrossel", "estático": "estatico", "estatico": "estatico" };
    const mapped = map[currentClient.preferredFormats[0].toLowerCase()] || "video";
    if ([...fmt.options].some((o) => o.value === mapped)) fmt.value = mapped;
  }

  document.getElementById("status").innerHTML = "";
  document.getElementById("resultado").innerHTML = "";

  await refreshLibrary();
}

// =============== LIBRARY ===============
async function refreshLibrary() {
  if (!currentClient) return;
  const r = await fetch(`/library/${currentClient.id}`);
  const lib = await r.json();
  document.getElementById("libStats").innerHTML = `
    <span><b>${lib.posts.length}</b>posts publicados</span>
    <span><b>${lib.transcripts.length}</b>transcrições de vídeo</span>
  `;
  document.getElementById("libPostsList").innerHTML = renderFileList(lib.posts, "posts");
  document.getElementById("libTranscriptsList").innerHTML = renderFileList(lib.transcripts, "transcripts");
}

function renderFileList(items, type) {
  if (!items.length) return '<div class="empty-list">Nenhum arquivo ainda</div>';
  return items
    .map(
      (f) => `
      <div class="file-item">
        <span class="name">📄 ${escapeHtml(f.filename)}</span>
        <span class="meta">${f.length} chars</span>
        <div class="actions">
          <button class="tiny" onclick="viewFile('${type}','${escapeAttr(f.filename)}')">👁️ Ver</button>
          <button class="tiny" onclick="editFile('${type}','${escapeAttr(f.filename)}')">✏️ Editar</button>
          <button class="tiny danger" onclick="deleteFile('${type}','${escapeAttr(f.filename)}')">🗑️ Remover</button>
        </div>
      </div>`
    )
    .join("");
}

async function viewFile(type, filename) {
  const r = await fetch(`/library/${currentClient.id}/${type}/${encodeURIComponent(filename)}`);
  const data = await r.json();
  if (!data.ok) { alert("Erro: " + data.error); return; }
  document.getElementById("dlgViewTitle").textContent = `📄 ${filename}`;
  document.getElementById("dlgViewContent").textContent = data.content;
  document.getElementById("dlgView").showModal();
}

async function editFile(type, filename) {
  const r = await fetch(`/library/${currentClient.id}/${type}/${encodeURIComponent(filename)}`);
  const data = await r.json();
  if (!data.ok) { alert("Erro: " + data.error); return; }
  const dlg = document.getElementById("dlgEdit");
  document.getElementById("dlgEditTitle").textContent = `✏️ ${filename}`;
  document.getElementById("dlgEditContent").value = data.content;
  document.getElementById("dlgEditSave").onclick = async () => {
    const newContent = document.getElementById("dlgEditContent").value;
    const r2 = await fetch(`/library/${currentClient.id}/${type}/${encodeURIComponent(filename)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newContent }),
    });
    const data2 = await r2.json();
    if (!data2.ok) { alert("Erro: " + data2.error); return; }
    dlg.close();
    await refreshLibrary();
  };
  dlg.showModal();
}

async function deleteFile(type, filename) {
  if (!confirm(`Remover "${filename}"? Essa ação não pode ser desfeita.`)) return;
  const r = await fetch(`/library/${currentClient.id}/${type}/${encodeURIComponent(filename)}`, {
    method: "DELETE",
  });
  const data = await r.json();
  if (!data.ok) { alert("Erro: " + data.error); return; }
  await refreshLibrary();
}

// Adicionar item via painel inline
document.getElementById("libSaveBtn").onclick = async () => {
  const type = document.getElementById("libType").value;
  const filename = document.getElementById("libFilename").value;
  const content = document.getElementById("libContent").value;
  if (!content.trim()) { alert("Cole o conteúdo antes de salvar"); return; }

  const btn = document.getElementById("libSaveBtn");
  btn.disabled = true;
  try {
    const r = await fetch(`/library/${currentClient.id}/${type}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, content }),
    });
    const data = await r.json();
    if (!data.ok) throw new Error(data.error);
    document.getElementById("libContent").value = "";
    document.getElementById("libFilename").value = "";
    await refreshLibrary();
  } catch (e) {
    alert("Erro: " + e.message);
  }
  btn.disabled = false;
};

// =============== DESCRIÇÃO ===============
document.getElementById("btnSaveDescription").onclick = async () => {
  if (!currentClient) return;
  const description = document.getElementById("clientDescription").value;
  const btn = document.getElementById("btnSaveDescription");
  btn.disabled = true;
  try {
    const r = await fetch(`/clients/${currentClient.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    });
    const data = await r.json();
    if (!data.ok) throw new Error(data.error);
    currentClient.description = description;
    document.getElementById("descSaveFeedback").textContent = "✅ Salvo";
    setTimeout(() => { document.getElementById("descSaveFeedback").textContent = ""; }, 2500);
  } catch (e) {
    alert("Erro: " + e.message);
  }
  btn.disabled = false;
};

// =============== ADICIONAR CLIENTE ===============
document.getElementById("btnAddClient").onclick = () => {
  // Reset
  ["ncName","ncId","ncInstagram","ncWebsite","ncDescription","ncTone","ncBalance","ncForbidden","ncHashtags"].forEach(id => {
    document.getElementById(id).value = "";
  });
  document.getElementById("ncNewsEnabled").checked = false;
  document.getElementById("initialContentList").innerHTML = "";
  addInitialContentItem();
  document.getElementById("dlgNewClient").showModal();
};

// Auto-gera o id a partir do nome
document.getElementById("ncName").addEventListener("input", (e) => {
  const slug = e.target.value.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-_ ]/g, "")
    .replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  const idField = document.getElementById("ncId");
  if (!idField.dataset.touched) idField.value = slug;
});
document.getElementById("ncId").addEventListener("input", (e) => {
  e.target.dataset.touched = "1";
});

let initialContentCounter = 0;
function addInitialContentItem() {
  const idx = initialContentCounter++;
  const div = document.createElement("div");
  div.className = "initial-content-item";
  div.dataset.idx = idx;
  div.innerHTML = `
    <div class="row">
      <div>
        <label>Tipo</label>
        <select class="ic-type">
          <option value="posts">Post publicado</option>
          <option value="transcripts">Transcrição de vídeo</option>
        </select>
      </div>
      <div>
        <label>Nome (opcional)</label>
        <input type="text" class="ic-filename" placeholder="ex: post-001">
      </div>
    </div>
    <label>Conteúdo</label>
    <textarea class="ic-content" placeholder="Cole aqui..." style="min-height:100px"></textarea>
    <button class="tiny danger" onclick="this.closest('.initial-content-item').remove()">🗑️ Remover este item</button>
  `;
  document.getElementById("initialContentList").appendChild(div);
}
document.getElementById("btnAddInitialContent").onclick = addInitialContentItem;

document.getElementById("btnCreateClient").onclick = async () => {
  const name = document.getElementById("ncName").value.trim();
  const id = document.getElementById("ncId").value.trim();
  const instagram = document.getElementById("ncInstagram").value.trim();
  if (!name || !id || !instagram) { alert("Nome, ID e Instagram são obrigatórios"); return; }

  const description = document.getElementById("ncDescription").value.trim();
  if (!description) { alert("A descrição é obrigatória — é o que orienta a IA."); return; }

  const config = {
    id,
    name,
    instagram,
    website: document.getElementById("ncWebsite").value.trim(),
    description,
    tone: document.getElementById("ncTone").value.trim(),
    requiredBalance: splitCsv(document.getElementById("ncBalance").value),
    forbiddenTopics: splitCsv(document.getElementById("ncForbidden").value),
    hashtagsBase: document.getElementById("ncHashtags").value.trim().split(/\s+/).filter(Boolean),
    preferredFormats: ["vídeo", "carrossel", "estatico"],
  };

  if (document.getElementById("ncNewsEnabled").checked) {
    // Pré-popula com feeds e keywords padrão de advocacia
    config.newsFeeds = [
      "https://g1.globo.com/rss/g1/economia/",
      "https://g1.globo.com/rss/g1/politica/",
      "https://agenciabrasil.ebc.com.br/rss/economia/feed.xml",
    ];
    config.newsKeywords = ["INSS", "aposentad", "previd", "FGTS", "juros abusiv", "dívida", "lei", "STF decide", "STJ decide"];
    config.newsExclude = ["criminal", "homicíd", "tráfic"];
  }

  const btn = document.getElementById("btnCreateClient");
  btn.disabled = true;
  try {
    const r = await fetch("/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    const data = await r.json();
    if (!data.ok) throw new Error(data.error);

    // Salva conteúdo inicial (se houver)
    const items = document.querySelectorAll(".initial-content-item");
    for (const item of items) {
      const content = item.querySelector(".ic-content").value.trim();
      if (!content) continue;
      const type = item.querySelector(".ic-type").value;
      const filename = item.querySelector(".ic-filename").value;
      await fetch(`/library/${data.client.id}/${type}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, content }),
      });
    }

    document.getElementById("dlgNewClient").close();
    localStorage.setItem(STORAGE_KEY, data.client.id);
    await loadClients();
  } catch (e) {
    alert("Erro: " + e.message);
  }
  btn.disabled = false;
};

function splitCsv(s) {
  return (s || "").split(",").map((x) => x.trim()).filter(Boolean);
}

// =============== SELETOR ===============
document.getElementById("clientSelect").onchange = (e) => selectClient(e.target.value);

// =============== GERAR BRIEFING ===============
document.getElementById("btn").onclick = async () => {
  if (!currentClient) return;
  const btn = document.getElementById("btn");
  const status = document.getElementById("status");
  const out = document.getElementById("resultado");
  out.innerHTML = "";
  btn.disabled = true;
  status.innerHTML = '<p class="status-line">⏳ Coletando fontes... (10-30s)</p>';

  const body = {
    clientId: currentClient.id,
    dias: document.getElementById("dias").value,
    formato: document.getElementById("formato").value,
    incluirNoticias: document.getElementById("incluirNoticias")?.checked || false,
    semanaAnterior: document.getElementById("semanaAnterior")?.checked || false,
    sugerirDataTematica: document.getElementById("sugerirDataTematica").checked,
  };

  try {
    const r = await fetch("/gerar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || "Erro desconhecido");

    status.innerHTML = `<p class="status-line success">✅ <b>${data.resumo.cliente}</b> &nbsp;•&nbsp; ${data.resumo.formato} &nbsp;•&nbsp; ${data.resumo.libraryPosts} posts da library &nbsp;•&nbsp; ${data.resumo.libraryTranscripts} transcripts &nbsp;•&nbsp; ${data.resumo.noticiasEncontradas} notícias &nbsp;•&nbsp; ${data.resumo.datasTematicas} datas temáticas &nbsp;•&nbsp; ${data.resumo.bytesBriefing} chars</p>`;

    out.innerHTML = `
      <div class="step"><b>1.</b> Briefing salvo em <code>${data.filepath.replace(/\\/g, "/")}</code></div>
      <div class="step"><b>2.</b> Clique em <b>Copiar</b> abaixo</div>
      <div class="step"><b>3.</b> Cole no Claude Code e peça os roteiros</div>
      <br>
      <div class="briefing-box">
        <button class="copy" onclick="copyBriefing()">📋 Copiar briefing</button>
        <button class="copy" onclick="downloadBriefing()">⬇️ Baixar .md</button>
        <pre id="briefingText">${escapeHtml(data.briefing)}</pre>
      </div>`;
    window.__briefing = data.briefing;
  } catch (e) {
    status.innerHTML = '<p class="status-line error">Erro: ' + e.message + "</p>";
  }
  btn.disabled = false;
};

// =============== GERAR COM IA ===============
document.getElementById("btnIA").onclick = async () => {
  if (!currentClient) return;
  if (!systemStatus.aiEnabled) {
    alert("Configure ANTHROPIC_API_KEY no arquivo .env e reinicie o servidor.");
    return;
  }

  const btn = document.getElementById("btnIA");
  const status = document.getElementById("status");
  btn.disabled = true;
  status.innerHTML = '<p class="status-line">🤖 Gerando com Claude Sonnet 4.6... (pode levar 30-90s)</p>';

  const body = {
    clientId: currentClient.id,
    dias: document.getElementById("dias").value,
    formato: document.getElementById("formato").value,
    incluirNoticias: document.getElementById("incluirNoticias")?.checked || false,
    semanaAnterior: document.getElementById("semanaAnterior")?.checked || false,
    sugerirDataTematica: document.getElementById("sugerirDataTematica").checked,
  };

  try {
    const r = await fetch("/gerar-com-ia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || "Erro desconhecido");

    status.innerHTML = `<p class="status-line success">✅ Roteiros gerados pela IA &nbsp;•&nbsp; ${data.ai.usage.input_tokens} tokens in &nbsp;•&nbsp; ${data.ai.usage.output_tokens} tokens out</p>`;

    // Mostra resultado em modal
    document.getElementById("dlgAIMeta").innerHTML = `
      Modelo: <b>${data.ai.model}</b> • Stop: ${data.ai.stop_reason} •
      ${data.ai.usage.input_tokens} tokens in / ${data.ai.usage.output_tokens} tokens out •
      Salvo em <code>${data.ai.filepath.replace(/\\/g, "/")}</code>
    `;
    document.getElementById("dlgAIContent").textContent = data.ai.text;
    window.__aiResult = data.ai.text;
    window.__aiClientId = currentClient.id;
    document.getElementById("dlgAI").showModal();
  } catch (e) {
    status.innerHTML = '<p class="status-line error">Erro: ' + e.message + '</p>';
  }
  btn.disabled = false;
};

function copyAIResult() {
  navigator.clipboard.writeText(window.__aiResult).then(() => {
    alert("Roteiros copiados!");
  });
}
function downloadAIResult() {
  const blob = new Blob([window.__aiResult], { type: "text/markdown" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `roteiros-${window.__aiClientId}.md`;
  a.click();
}

// =============== HELPERS ===============
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]));
}
function escapeAttr(s) {
  return String(s).replace(/'/g, "\\'").replace(/"/g, "&quot;");
}
function copyBriefing() {
  navigator.clipboard.writeText(window.__briefing).then(() => {
    alert("Briefing copiado! Cole no Claude Code.");
  });
}
function downloadBriefing() {
  const blob = new Blob([window.__briefing], { type: "text/markdown" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `briefing-${currentClient.id}.md`;
  a.click();
}

loadSystemStatus();
loadClients();
