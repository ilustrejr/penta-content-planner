// Monta o briefing markdown a partir da config do cliente + fontes coletadas.
// Não chama API nenhuma — você cola o resultado no Claude Code.

const FORMAT_LABELS = {
  carrossel: "Carrossel",
  estatico: "Post estático",
  video: "Vídeo (script de gravação)",
};

const FORMAT_TEMPLATES = {
  carrossel: `**Para CARROSSEL — siga rigorosamente essa estrutura:**

Cada carrossel tem entre 5 e 10 slides. Para CADA slide, descreva:

1. **Número do slide** (ex: "Slide 1 de 7")
2. **Função do slide** na narrativa (gancho, contexto, dado, exemplo, virada, CTA, etc.)
3. **Texto que aparece no slide** — literal, pronto pra colocar no design. Inclua:
   - Título principal (1 linha curta)
   - Subtítulo ou texto de apoio (se houver)
   - Hierarquia: o que é grande, o que é pequeno
4. **Descrição visual completa** — descreva como se estivesse briefando um designer:
   - Cor dominante e mood (ex: "fundo escuro com lima neon nos números")
   - Composição (centralizado / canto / fullbleed)
   - Que tipo de imagem/ilustração/grafismo aparece
   - Onde fica o texto (topo / centro / base)
   - Algum elemento interativo (seta, número grande, ícone)
5. **Call-to-scroll** (se aplicável) — frase ou seta indicando "veja o próximo slide"

**Estrutura recomendada da narrativa:**
- **Slide 1:** gancho forte. Pode ser uma pergunta provocativa, estatística impactante, ou afirmação polêmica. NUNCA explica tudo no slide 1 — instiga curiosidade pro próximo.
- **Slides 2 a N-1:** desenvolvimento. UM ponto claro por slide. Sem amontoar texto. Cada slide é uma unidade visual completa.
- **Penúltimo slide:** insight, virada, ou síntese do que foi dito.
- **Último slide:** CTA explícito + call to bio. Ex: "Quer saber mais? Link na bio."

Depois de descrever todos os slides, entregue:

- **Legenda completa** (a que vai abaixo do post no feed) — com gancho na primeira linha + desenvolvimento curto + CTA + hashtags
- **Hashtags base + temáticas**`,

  estatico: `**Para POST ESTÁTICO — uma única imagem ou arte:**

- **Descrição da imagem completa** — o que aparece (composição, elementos, cores, mood, estilo). Detalhe suficiente pra um designer executar sem dúvidas.
- **Texto sobreposto** (se aplicável):
  - Título principal (frase curta de impacto)
  - Subtítulo (se houver)
  - Posicionamento na imagem (topo, centro, base)
- **Legenda completa** (gancho + desenvolvimento + CTA)
- **Hashtags**`,

  video: `**Para SCRIPT DE VÍDEO:**

- **Roteiro com falas** segundo a segundo ou cena a cena, contendo:
  - Gancho dos primeiros 3 segundos (frase de impacto, pergunta, ou cena visual forte)
  - Desenvolvimento (40-60s)
  - Virada / insight
  - CTA final
- **Indicações de cena, corte e cenário** entre [colchetes]
- **Legenda completa** com gancho + desenvolvimento + CTA
- **Hashtags**`,
};

export function montarBriefing({ client, dias, formatos, incluirNoticias, sugerirDataTematica, fontes }) {
  const lines = [];

  // String descritiva da distribuição
  const distribuicao = Object.entries(formatos)
    .filter(([_, n]) => n > 0)
    .map(([f, n]) => `${n} ${FORMAT_LABELS[f]}`)
    .join(" + ");

  lines.push(`# Briefing — Planejamento de conteúdo @${client.instagram}`);
  lines.push(``);
  lines.push(`**Cliente:** ${client.name}`);
  lines.push(`**Período:** ${dias} dias`);
  lines.push(`**Distribuição de formatos:** ${distribuicao} = ${dias} posts`);
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
  lines.push(`Gere **${dias} posts** (1 por dia) para o @${client.instagram}, distribuídos assim:`);
  lines.push(``);
  Object.entries(formatos).forEach(([f, n]) => {
    if (n > 0) lines.push(`- **${n} posts** em formato **${FORMAT_LABELS[f]}**`);
  });
  lines.push(``);
  lines.push(`Distribua os formatos ao longo dos dias da forma que fizer mais sentido pro tema de cada post (alguns assuntos pedem vídeo, outros pedem carrossel). Mantenha variedade.`);
  lines.push(``);

  // Renderiza o template de cada formato selecionado
  lines.push(`### Como entregar cada formato`);
  lines.push(``);
  Object.entries(formatos).forEach(([f, n]) => {
    if (n === 0) return;
    lines.push(`#### ${FORMAT_LABELS[f]}`);
    lines.push(``);
    lines.push(FORMAT_TEMPLATES[f]);
    lines.push(``);
  });

  lines.push(`### Cabeçalho de cada post`);
  lines.push(``);
  lines.push(`Pra cada post, comece com:`);
  lines.push(``);
  lines.push(`**Dia X — [Tema]**`);
  if (client.requiredBalance?.length) {
    lines.push(`- **Área:** ${client.requiredBalance.join(" | ")}`);
  }
  lines.push(`- **Formato:** [carrossel | post estático | vídeo]`);
  lines.push(`- **Fonte:** url ou nome (se baseado em notícia/data temática)`);
  lines.push(`- **Justificativa:** por que esse tema agora`);
  lines.push(`- **Conteúdo do post** no formato pedido acima`);
  lines.push(`- **Legenda + hashtags**`);
  lines.push(``);
  if (client.requiredBalance?.length) {
    lines.push(`Distribua as áreas (${client.requiredBalance.join(", ")}) de forma equilibrada ao longo dos ${dias} dias.`);
  }

  return lines.join("\n");
}
