// Datas comemorativas brasileiras relevantes pra conteúdo de marca

const FIXED_DATES = [
  { date: "01-01", name: "Ano Novo" },
  { date: "01-25", name: "Aniversário de São Paulo" },
  { date: "02-02", name: "Dia de Iemanjá" },
  { date: "03-08", name: "Dia Internacional da Mulher" },
  { date: "03-15", name: "Dia Mundial do Consumidor" },
  { date: "04-19", name: "Dia dos Povos Indígenas" },
  { date: "04-21", name: "Tiradentes" },
  { date: "04-22", name: "Descobrimento do Brasil" },
  { date: "05-01", name: "Dia do Trabalhador" },
  { date: "05-13", name: "Abolição da Escravatura" },
  { date: "06-05", name: "Dia Mundial do Meio Ambiente" },
  { date: "06-12", name: "Dia dos Namorados" },
  { date: "06-24", name: "São João" },
  { date: "07-20", name: "Dia do Amigo" },
  { date: "08-11", name: "Dia do Estudante" },
  { date: "08-22", name: "Dia do Folclore" },
  { date: "09-07", name: "Independência do Brasil" },
  { date: "09-15", name: "Dia do Cliente" },
  { date: "09-21", name: "Dia da Árvore" },
  { date: "09-23", name: "Início da Primavera" },
  { date: "10-12", name: "Dia das Crianças / Nossa Senhora Aparecida" },
  { date: "10-15", name: "Dia do Professor" },
  { date: "10-31", name: "Halloween" },
  { date: "11-02", name: "Finados" },
  { date: "11-15", name: "Proclamação da República" },
  { date: "11-19", name: "Dia da Bandeira" },
  { date: "11-20", name: "Dia da Consciência Negra" },
  { date: "12-25", name: "Natal" },
  { date: "12-31", name: "Réveillon" },
];

// ----- Datas variáveis (calculadas por ano) -----
function nthSundayOf(year, monthIndex, n) {
  const first = new Date(year, monthIndex, 1);
  const dow = first.getDay(); // 0 = domingo
  const firstSunday = 1 + ((7 - dow) % 7);
  return new Date(year, monthIndex, firstSunday + (n - 1) * 7);
}

function lastFridayOf(year, monthIndex) {
  const last = new Date(year, monthIndex + 1, 0); // último dia do mês
  const dow = last.getDay();
  const offset = (dow - 5 + 7) % 7;
  return new Date(year, monthIndex, last.getDate() - offset);
}

function easter(year) {
  // Algoritmo de Meeus/Jones/Butcher
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const L = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * L) / 451);
  const month = Math.floor((h + L - 7 * m + 114) / 31);
  const day = ((h + L - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function carnaval(year) {
  // Terça-feira de carnaval = Páscoa - 47 dias
  const e = easter(year);
  return new Date(e.getTime() - 47 * 86400000);
}

const MOVEABLE = [
  { name: "Dia das Mães", fn: (y) => nthSundayOf(y, 4, 2) },
  { name: "Dia dos Pais", fn: (y) => nthSundayOf(y, 7, 2) },
  { name: "Black Friday", fn: (y) => lastFridayOf(y, 10) },
  { name: "Carnaval", fn: (y) => carnaval(y) },
  { name: "Páscoa", fn: (y) => easter(y) },
];

export function getUpcomingThemes(daysAhead = 45) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const limit = new Date(today.getTime() + daysAhead * 86400000);
  const year = today.getFullYear();
  const all = [];

  for (const { date, name } of FIXED_DATES) {
    const [m, d] = date.split("-").map(Number);
    let candidate = new Date(year, m - 1, d);
    if (candidate < today) candidate = new Date(year + 1, m - 1, d);
    if (candidate >= today && candidate <= limit) {
      all.push({ date: candidate, name });
    }
  }

  for (const { fn, name } of MOVEABLE) {
    let cand = fn(year);
    if (cand < today) cand = fn(year + 1);
    if (cand >= today && cand <= limit) {
      all.push({ date: cand, name });
    }
  }

  all.sort((a, b) => a.date - b.date);
  return all.map((t) => ({
    date: t.date.toISOString().slice(0, 10),
    name: t.name,
    daysAway: Math.round((t.date - today) / 86400000),
  }));
}
