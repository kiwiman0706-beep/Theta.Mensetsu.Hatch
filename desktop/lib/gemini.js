// Gemini REST. The prompts (prompts.json) may hold {{name}} slots filled from `vars`.
"use strict";
const PROMPTS = require("./prompts.json");
const API = "https://generativelanguage.googleapis.com/v1beta/";

async function request(key, pathAndQuery, body, fetchImpl = fetch) {
  const res = await fetchImpl(API + pathAndQuery, {
    method: body ? "POST" : "GET",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(90000),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = "";
    try {
      message = JSON.parse(text).error.message;
    } catch {}
    message = String(message).split(key).join("[APIキー]");
    throw new Error(
      `Gemini HTTP ${res.status}\n${message}\n` +
        (res.status === 429 ? "利用上限または混雑です。時間を空けて再試行してください。" : res.status === 404 ? "モデル一覧を取得して利用可能なモデルに変更してください。" : "APIキー・モデル名・請求設定を確認してください。"),
    );
  }
  return JSON.parse(text);
}

async function models(key, fetchImpl) {
  const out = [];
  let token = "";
  for (let i = 0; i < 10; i++) {
    const r = await request(key, "models?pageSize=100" + (token ? "&pageToken=" + encodeURIComponent(token) : ""), null, fetchImpl);
    for (const m of r.models || [])
      if (String(m.name).includes("gemini") && (m.supportedGenerationMethods || []).includes("generateContent")) out.push(m.name.replace("models/", ""));
    token = r.nextPageToken || "";
    if (!token) break;
  }
  return out;
}

// images: Buffers of JPEG (already downscaled by the caller).
async function generate({ key, model, format }, kind, images, fetchImpl, vars = {}) {
  if (!images.length) throw new Error("画像を追加してください");
  if (images.length > 20) throw new Error("1件の認識は20ページまでです");
  if (!/^[A-Za-z0-9._-]+$/.test(model)) throw new Error("モデル名が不正です");
  const { keys } = PROMPTS[kind];
  const prompt = PROMPTS[kind].prompt.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ""));
  let bytes = 0;
  const parts = [{ text: prompt }];
  for (const b of images) {
    bytes += b.length;
    if (bytes > 12 * 1024 * 1024) throw new Error("画像データが大きすぎます。ページを分けてください");
    parts.push({ inlineData: { mimeType: "image/jpeg", data: b.toString("base64") } });
  }
  const schema = { type: "object", properties: Object.fromEntries(keys.map((k) => [k, { type: "string" }])), required: keys };
  const config = { temperature: 0.1 };
  if (format === "modern") config.responseFormat = { text: { mimeType: "application/json", schema } };
  else Object.assign(config, { responseMimeType: "application/json", responseSchema: schema });
  const r = await request(key, `models/${model}:generateContent`, { contents: [{ role: "user", parts }], generationConfig: config }, fetchImpl);
  const cand = (r.candidates || [])[0];
  if (!cand) throw new Error("認識結果がありません。画像やAPI設定を確認してください");
  if ((cand.finishReason || "STOP") !== "STOP") throw new Error("認識が完了しませんでした: " + cand.finishReason);
  let t = (cand.content.parts || []).filter((x) => !x.thought).map((x) => x.text || "").join("").trim();
  if (t.startsWith("```")) t = t.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  const out = JSON.parse(t);
  for (const k of keys) if (typeof out[k] !== "string") throw new Error("認識結果の形式が不正です。再試行してください");
  return out;
}


const textOf = (r) => ((r.candidates || [])[0]?.content?.parts || []).filter((x) => !x.thought).map((x) => x.text || "").join("").trim();
const jsonOf = (t) => {
  const m = /\{[\s\S]*\}/.exec(String(t).replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, ""));
  if (!m) throw new Error("結果の形式が不正です。再試行してください");
  return JSON.parse(m[0]);
};

// Larger recordings go through the Files API (inline requests are limited to about 20 MB); the
// file is deleted from Google right after the answer.
async function uploadFile(key, bytes, mime, fetchImpl) {
  const start = await fetchImpl("https://generativelanguage.googleapis.com/upload/v1beta/files", {
    method: "POST",
    headers: {
      "x-goog-api-key": key,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.length),
      "X-Goog-Upload-Header-Content-Type": mime,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: "interview" } }),
  });
  const url = start.headers.get("x-goog-upload-url");
  if (!start.ok || !url) throw new Error("録音をGeminiに送れませんでした（HTTP " + start.status + "）");
  const up = await fetchImpl(url, { method: "POST", headers: { "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" }, body: bytes, signal: AbortSignal.timeout(600000) });
  const file = (await up.json()).file;
  for (let i = 0; i < 60 && file.state === "PROCESSING"; i++) {
    await new Promise((ok) => setTimeout(ok, 3000));
    Object.assign(file, await request(key, file.name, null, fetchImpl));
  }
  if (file.state === "FAILED") throw new Error("Geminiが録音を読み込めませんでした");
  return file;
}

// An interview recording → { transcript, summary }.
async function transcribe({ key, model }, bytes, mime, fetchImpl = fetch) {
  if (!/^[A-Za-z0-9._-]+$/.test(model)) throw new Error("モデル名が不正です");
  const { prompt } = PROMPTS.transcribe;
  let part, file = null;
  if (bytes.length < 14 * 1024 * 1024) part = { inlineData: { mimeType: mime, data: Buffer.from(bytes).toString("base64") } };
  else {
    file = await uploadFile(key, bytes, mime, fetchImpl);
    part = { fileData: { mimeType: mime, fileUri: file.uri } };
  }
  try {
    const r = await request(key, `models/${model}:generateContent`, { contents: [{ role: "user", parts: [{ text: prompt }, part] }], generationConfig: { temperature: 0.1, maxOutputTokens: 65536, responseMimeType: "application/json" } }, fetchImpl);
    const out = jsonOf(textOf(r));
    return { transcript: String(out.transcript || ""), summary: String(out.summary || "") };
  } finally {
    if (file) await request(key, file.name, null, (u, o) => fetchImpl(u, { ...o, method: "DELETE" })).catch(() => {});
  }
}

// Commuting from the applicant's address to the workplace, estimated by Gemini with Google Search.
async function commute({ key, model }, from, to, fetchImpl = fetch) {
  if (!/^[A-Za-z0-9._-]+$/.test(model)) throw new Error("モデル名が不正です");
  const prompt = PROMPTS.commute.prompt.replace("{{from}}", from).replace("{{to}}", to);
  const r = await request(key, `models/${model}:generateContent`, { contents: [{ role: "user", parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0.2 } }, fetchImpl);
  return jsonOf(textOf(r));
}

module.exports = { models, generate, transcribe, commute };
