// Monta o briefing markdown a partir da config do cliente + fontes coletadas.
// Não chama API nenhuma — você cola o resultado no Claude Code.

const FORMAT_LABELS = {
  carrossel: "Carrossel",
  estatico: "Post estático",
  video: "Vídeo (script de gravação)",
};

const FORMAT_TEMPLATES = {
  carrossel: `Cada post deve ser um **CARROSSEL** entregue assim:

- **Slides** (mínimo 5, máximo 10) — para cada slide:
  - Texto que aparece no slide
  - Descrição visual: o que deve aparecer (foto/ilustração/composição)
- **Legenda completa** com gancho na 1ª linha + desenvolvimento + CTA claro
- **Hashtags**`,

  estatico: `Cada post deve ser um **POST ESTÁTICO** entregue assim:

- **Descrição da imagem**: o que aparece (composição, elementos, cores, mood)
- **Texto sobre a imagem** (se aplicável): título principal + subtítulo
- **Legenda completa** com gancho na 1ª linha + desenvolvimento + CTA claro
- **Hashtags**`,

  video: `Cada post deve ser um **SCRIPT DE VÍDEO** entregue assim:

- **Roteiro com falas** segundo a segundo ou cena a cena, contendo:
  - Gancho dos primeiros 3 segundos
  - Desenvolvimento (40-50s)
  - Virada/insight
  - CTA final
- **Indicações de cena/corte/cenário** entre [colchetes]
- **Legenda completa** com gancho + desenvolvimento + CTA
- **Hashtags**`,
};

export function montarBriefing({ client, dias, formato, incluirNoticias, sugerirDataTematica, fontes }) {
  const lines = [];
  lines.push(`# Briefing — Planejamento de conteúdo @${client.instagram}`);
  lines.push(``);
  lines.push(`**Cliente:** ${client.name}`);
  lines.push(`**Período:** ${dias} dias`);
  lines.push(`**Formato:** ${FORMAT_LABELS[formato] || formato}`);
  lines.push(`**Incluir notícias recentes:** ${incluirNoticias ? "sim" : "não"}`);
  lines.push(`**Sugerir data temática próxima:** ${sugerirDataTematica ? "sim" : "não"}`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  if (client.description) {
    lines.push(`## SOBRE O CLIENTE (ORIENTAÇÕES MESTRES)`);
    lines.push(client.description);
    lines.push(``);
  }

  lines.push(`## REGRAS OBRIGATÓRIAS`);
  if (client.forbiddenTopics?.length) {
    client.forbiddenTopics.forEach((t) => lines.push(`- ❌ NUNCA propor conteúdo de **${t}**`));
  }
  if (client.requiredBalance?.length) {
    lines.push(`- ⚖️ Balancear entre **${client.requiredBalance.join(" / ")}**`);
  }
  if (client.seriesName) {
    lines.push(`- 🎬 Série/quadro: **"${client.seriesName}"**`);
  }
  if (client.tone) {
    lines.push(`- 🗣️ Tom de voz: ${client.tone}`);
  }
  if (client.captionStructure) {
    lines.push(`- 📱 Estrutura de legenda: ${client.captionStructure}`);
  }
  lines.push(`- 🔁 NÃO repetir temas que já apareceram nos posts anteriores do @${client.instagram} (lista abaixo)`);
  if (client.hashtagsBase?.length) {
    lines.push(`- #️⃣ Hashtags base do perfil: ${client.hashtagsBase.join(" ")}`);
  }
  if (client.extraInstructions) {
    lines.push(`- 📌 ${client.extraInstructions}`);
  }
  lines.push(``);

  lines.push(`## INFORMAÇÕES DO SITE (${client.website || "—"})`);
  lines.push("```");
  lines.push(fontes.siteText);
  lines.push("```");
  lines.push(``);

  lines.push(`## POSTS RECENTES DO @${client.instagram} (NÃO REPITA ESSES TEMAS)`);
  if (!fontes.clientPosts.length) {
    lines.push(`_(nenhum post lido)_`);
  } else {
    fontes.clientPosts.forEach((p, i) => {
      if (p.error) lines.push(`- ⚠️ ${p.error}`);
      else lines.push(`- ${i + 1}. ${p.caption}`);
    });
  }
  lines.push(``);

  if (fontes.referencePosts?.length) {
    fontes.referencePosts.forEach((ref) => {
      lines.push(`## INSPIRAÇÃO @${ref.handle} (${ref.label})`);
      ref.posts.forEach((p, i) => {
        if (p.error) lines.push(`- ⚠️ ${p.error}`);
        else lines.push(`- ${i + 1}. ${p.caption}`);
      });
      lines.push(``);
    });
  }

  // Biblioteca de posts já publicados (referência de tom + anti-repetição)
  if (fontes.library?.posts?.length) {
    lines.push(`## EXEMPLOS DE POSTS JÁ PUBLICADOS PELO CLIENTE`);
    lines.push(`_(use como referência forte de TOM e ESTILO. Não repita os temas listados aqui.)_`);
    lines.push(``);
    fontes.library.posts.forEach((p) => {
      lines.push(`### 📄 ${p.filename}`);
      lines.push(p.content);
      lines.push(``);
    });
  }

  // Transcrições de vídeos (referência de tom de fala)
  if (fontes.library?.transcripts?.length) {
    lines.push(`## TRANSCRIÇÕES DE VÍDEOS DO CLIENTE`);
    lines.push(`_(use como referência do JEITO DE FALAR — pausas, expressões, ritmo, frases típicas. Os roteiros gerados devem soar como essas transcrições.)_`);
    lines.push(``);
    fontes.library.transcripts.forEach((t) => {
      lines.push(`### 🎬 ${t.filename}`);
      lines.push(t.content);
      lines.push(``);
    });
  }

  if (incluirNoticias) {
    lines.push(`## NOTÍCIAS RECENTES RELEVANTES`);
    if (!fontes.noticias.length) {
      lines.push(`_(nenhuma notícia relevante encontrada no período)_`);
    } else {
      fontes.noticias.forEach((n, i) => {
        lines.push(`### ${i + 1}. ${n.title}`);
        lines.push(`- Fonte: ${n.source}`);
        lines.push(`- Resumo: ${n.summary}`);
        lines.push(`- Link: ${n.link}`);
        lines.push(``);
      });
    }
  }

  if (sugerirDataTematica && fontes.datasTematicas?.length) {
    lines.push(`## DATAS TEMÁTICAS PRÓXIMAS`);
    lines.push(`_(considere usar UMA dessas datas como gancho temático em pelo menos um dos posts, sempre adaptando à realidade e tom do cliente. NÃO force se não fizer sentido pro nicho.)_`);
    lines.push(``);
    fontes.datasTematicas.forEach((d) => {
      lines.push(`- **${d.date}** (em ${d.daysAway} dias) — ${d.name}`);
    });
    lines.push(``);
  }

  lines.push(`---`);
  lines.push(``);
  lines.push(`## SUA TAREFA`);
  lines.push(``);
  lines.push(`Gere **${dias} posts** (1 por dia) para o @${client.instagram} seguindo TODAS as regras acima.`);
  lines.push(``);
  lines.push(FORMAT_TEMPLATES[formato] || FORMAT_TEMPLATES.video);
  lines.push(``);
  lines.push(`### Estrutura por post`);
  lines.push(``);
  lines.push(`**Dia X — [Tema]**`);
  if (client.requiredBalance?.length) {
    lines.push(`- **Área:** ${client.requiredBalance.join(" | ")}`);
  }
  lines.push(`- **Formato:** ${FORMAT_LABELS[formato] || formato}`);
  lines.push(`- **Fonte:** url ou nome (se baseado em notícia/data temática/etc.)`);
  lines.push(`- **Justificativa:** por que esse tema agora`);
  lines.push(`- **Conteúdo do post** no formato pedido acima`);
  lines.push(`- **Legenda + hashtags**`);
  lines.push(``);
  if (client.requiredBalance?.length) {
    lines.push(`Distribua as áreas (${client.requiredBalance.join(", ")}) de forma equilibrada ao longo dos ${dias} dias.`);
  }

  return lines.join("\n");
}
