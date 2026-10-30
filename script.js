const $ = id => document.getElementById(id);
const STORE = "foxChallenge.userQuestions.v2";
let baseQuestions = [], userQuestions = [], editingId = null, currentQuiz = null;

const norm = value => String(value ?? "")
  .normalize("NFKC").toLowerCase()
  .replace(/[ァ-ン]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
  .replace(/[ \u3000\t\r\n。、，．・「」『』？！!?]/g, "");

const all = () => [...baseQuestions, ...userQuestions];
function uid() {
  return (crypto && crypto.randomUUID) ? crypto.randomUUID().replace(/-/g, "") :
    Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}
function cleanQuestion(q, fallbackId) {
  if (!q || typeof q.question !== "string" || typeof q.answer !== "string") return null;
  return {
    id: String(q.id || fallbackId || uid()),
    question: q.question.trim(),
    answer: q.answer.trim(),
    reading: typeof q.reading === "string" ? q.reading.trim() : ""
  };
}
function uniqueId(existing) {
  let id;
  do { id = uid(); } while (existing.has(id));
  existing.add(id);
  return id;
}
function loadLocal() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE) || "null");
    // v1データも読み込み、不要項目を取り除いてv2形式へ移行
    const legacy = parsed ?? JSON.parse(localStorage.getItem("foxChallenge.userQuestions.v1") || "[]");
    const rows = Array.isArray(legacy) ? legacy : [];
    const ids = new Set(), seenQuestions = new Set();
    userQuestions = [];
    for (const raw of rows) {
      const q = cleanQuestion(raw);
      if (!q || !q.question || !q.answer) continue;
      const key = norm(q.question);
      if (seenQuestions.has(key)) continue;
      seenQuestions.add(key);
      if (!q.id || ids.has(q.id)) q.id = uniqueId(ids); else ids.add(q.id);
      userQuestions.push(q);
    }
    localStorage.setItem(STORE, JSON.stringify(userQuestions));
  } catch (e) {
    userQuestions = [];
  }
}
function saveLocal() {
  try {
    localStorage.setItem(STORE, JSON.stringify(userQuestions));
  } catch (e) {
    alert("端末内への保存に失敗しました。ブラウザの空き容量などを確認してください。");
  }
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function rank(q, term) {
  const nq = norm(q.question), nr = norm(q.reading), t = norm(term);
  if (nq.startsWith(t) || (nr && nr.startsWith(t))) return 0;
  if (nq.includes(t) || (nr && nr.includes(t))) return 1;
  return 9;
}
async function copyText(value, button) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
    } else {
      const temp = document.createElement("textarea");
      temp.value = value; temp.style.position = "fixed"; temp.style.opacity = "0";
      document.body.appendChild(temp); temp.select();
      const ok = document.execCommand("copy"); temp.remove();
      if (!ok) throw new Error("copy failed");
    }
    const old = button.textContent; button.textContent = "コピー済み";
    setTimeout(() => button.textContent = old, 1200);
  } catch {
    button.textContent = "コピー不可";
    setTimeout(() => button.textContent = "答えをコピー", 1200);
  }
}
function render() {
  const term = $("query").value.trim(), list = all();
  //$("count").textContent = `全${list.length}問`;
  if (!term) {
    $("results").innerHTML = '<div class="empty">問題文の最初の文字や、覚えている単語を入力してください。</div>';
    return;
  }
  const found = list.map(q => ({...q, _rank: rank(q, term)}))
    .filter(q => q._rank < 9)
    .sort((a,b) => a._rank-b._rank ||
      norm(a.question).indexOf(norm(term))-norm(b.question).indexOf(norm(term)) ||
      a.question.localeCompare(b.question,"ja"));
  if (!found.length) {
    $("results").innerHTML = '<div class="empty">一致する問題がありません。別の文字や単語で検索してください。</div>';
    return;
  }
  $("results").innerHTML = found.map(q =>
    `<article class="result"><p class="qtext">${escapeHtml(q.question)}</p>
    <p class="answer">${escapeHtml(q.answer)}</p>
    <div class="resultfoot"><small>${q._rank===0?"先頭一致":"部分一致"}</small>
    <button type="button" class="sub copy" data-copy-id="${escapeHtml(q.id)}">答えをコピー</button></div></article>`
  ).join("");
  document.querySelectorAll("[data-copy-id]").forEach(b => {
    b.onclick = () => {
      const q = found.find(x => x.id === b.dataset.copyId);
      if (q) copyText(q.answer, b);
    };
  });
}
function showManager() {
  $("manager").classList.remove("hidden");
  renderManager();
}
function renderManager() {
  $("manageList").innerHTML = userQuestions.length ?
    userQuestions.map(q => `<div class="manageitem">
      <p>${escapeHtml(q.question)}</p><p class="answer">${escapeHtml(q.answer)}</p>
      <button type="button" class="sub" data-edit="${escapeHtml(q.id)}">編集</button>
      <button type="button" class="sub" data-del="${escapeHtml(q.id)}">削除</button>
    </div>`).join("") :
    '<p class="note">個人追加データはまだありません。</p>';
  document.querySelectorAll("[data-edit]").forEach(b =>
    b.onclick = () => openEdit(userQuestions.find(q => q.id === b.dataset.edit)));
  document.querySelectorAll("[data-del]").forEach(b => b.onclick = () => {
    if (confirm("この問題を削除しますか？")) {
      userQuestions = userQuestions.filter(q => q.id !== b.dataset.del);
      saveLocal(); renderManager(); render();
    }
  });
}
function openEdit(q) {
  editingId = q?.id || null;
  $("dialogTitle").textContent = q ? "問題を編集" : "問題を追加";
  $("editQuestion").value = q?.question || "";
  $("editAnswer").value = q?.answer || "";
  $("editReading").value = q?.reading || "";
  $("editDialog").showModal();
}
$("editForm").addEventListener("submit", e => {
  e.preventDefault();
  const question = $("editQuestion").value.trim();
  const answer = $("editAnswer").value.trim();
  if (!question || !answer) return;
  const duplicate = all().find(q => norm(q.question) === norm(question) && q.id !== editingId);
  if (duplicate) {
    alert("同じ問題文がすでに登録されています。問題文を確認してください。");
    return;
  }
  const q = {id: editingId || uid(), question, answer, reading: $("editReading").value.trim()};
  const i = userQuestions.findIndex(x => x.id === q.id);
  if (i >= 0) userQuestions[i] = q; else userQuestions.push(q);
  saveLocal(); $("editDialog").close(); renderManager(); render();
});
function randomQuestion() {
  const list = all();
  if (!list.length) return alert("問題データがありません。");
  currentQuiz = list[Math.floor(Math.random() * list.length)];
  $("quizQuestion").textContent = currentQuiz.question;
  $("quizAnswer").textContent = currentQuiz.answer;
  $("quizAnswer").classList.add("hidden");
  $("quiz").classList.remove("hidden");
}
$("query").addEventListener("input", render);
$("clearBtn").onclick = () => {$("query").value = ""; render(); $("query").focus();};
$("randomBtn").onclick = randomQuestion;
$("showAnswer").onclick = () => $("quizAnswer").classList.remove("hidden");
$("nextQuestion").onclick = randomQuestion;
$("closeQuiz").onclick = () => $("quiz").classList.add("hidden");
$("manageBtn").onclick = showManager;
$("closeManager").onclick = () => $("manager").classList.add("hidden");
$("addBtn").onclick = () => openEdit(null);
$("cancelEdit").onclick = () => $("editDialog").close();

$("exportBtn").onclick = () => {
  const payload = {schemaVersion: 1, exportedAt: new Date().toISOString(),
    questions: userQuestions.map(q => cleanQuestion(q)).filter(Boolean)};
  const blob = new Blob(["\uFEFF", JSON.stringify(payload, null, 2)],
    {type: "application/json;charset=utf-8"});
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = "fox-questions-backup.json";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$("importBtn").onclick = () => $("fileInput").click();
$("fileInput").onchange = async e => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const raw = (await file.text()).replace(/^\uFEFF/, "");
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.questions)) throw new Error("questions配列がありません");
    const incoming = data.questions.map(q => cleanQuestion(q)).filter(q => q && q.question && q.answer);
    const existing = new Set(all().map(q => norm(q.question)));
    const ids = new Set(all().map(q => q.id));
    let added = 0, skipped = 0;
    for (const q of incoming) {
      const key = norm(q.question);
      if (existing.has(key)) { skipped++; continue; }
      q.id = uniqueId(ids);
      userQuestions.push(q); existing.add(key); added++;
    }
    saveLocal(); renderManager(); render();
    alert(`取り込み完了\n追加：${added}件\n重複・形式不備：${skipped + (data.questions.length - incoming.length)}件`);
  } catch (err) {
    alert("JSONを読み込めませんでした：" + err.message);
  }
  e.target.value = "";
};
fetch("data/questions.json").then(r => {
  if (!r.ok) throw new Error("初期データの読み込みに失敗しました");
  return r.json();
}).then(d => {
  if (!Array.isArray(d.questions)) throw new Error("questions配列がありません");
  const ids = new Set(), seen = new Set();
  baseQuestions = [];
  for (const raw of d.questions) {
    const q = cleanQuestion(raw);
    if (!q || !q.question || !q.answer) continue;
    const key = norm(q.question);
    if (seen.has(key)) continue;
    seen.add(key);
    if (ids.has(q.id)) q.id = uniqueId(ids); else ids.add(q.id);
    baseQuestions.push(q);
  }
  loadLocal(); render();
}).catch(err => {
  loadLocal(); render();
  alert("初期データを読み込めません。data/questions.jsonを確認してください。");
});
