import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { AlertCircle, CheckCircle2, Download, Loader2, RefreshCw, RotateCw } from "lucide-react";
import { RELEASE_NOTES } from "./releaseNotes";
import { ReleaseNotesDialog } from "./WhatsNew";

type Phase =
  | { k: "idle" }
  | { k: "checking" }
  | { k: "latest" }
  | { k: "available"; update: Update }
  | { k: "downloading"; update: Update; done: number; total: number | null }
  | { k: "installed" }
  | { k: "error"; msg: string; detail: string };

const mb = (n: number) => (n / 1048576).toFixed(1);

function friendly(e: unknown): { msg: string; detail: string } {
  const detail = String((e as Error)?.message ?? e);
  if (/signature|pubkey|public key/i.test(detail))
    return { msg: "更新ファイルの署名を検証できませんでした。安全のため、この更新は適用しません。", detail };
  if (/network|fetch|request|dns|connect|time(d)? ?out|404|not found|status/i.test(detail))
    return { msg: "更新サーバー（GitHub）に接続できませんでした。インターネット接続や学内ネットワークの制限を確認して、もう一度お試しください。", detail };
  return { msg: "更新に失敗しました。時間をおいてもう一度お試しください。", detail };
}

const primary = "inline-flex items-center gap-1.5 rounded bg-slate-900 px-3 py-1.5 text-sm font-bold text-white hover:bg-slate-700";
const secondary = "inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-100 disabled:opacity-50";

export function UpdateChecker() {
  const [ver, setVer] = useState("");
  const [p, setP] = useState<Phase>({ k: "idle" });
  const [fade, setFade] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  useEffect(() => {
    getVersion().then(setVer).catch(() => setVer(""));
  }, []);

  // 「最新です」は数秒表示してフェードアウト
  useEffect(() => {
    if (p.k !== "latest") return;
    setFade(false);
    const a = setTimeout(() => setFade(true), 3000);
    const b = setTimeout(() => setP({ k: "idle" }), 3600);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [p.k]);

  // インストール完了後、案内を見せてから自己再起動
  useEffect(() => {
    if (p.k !== "installed") return;
    const t = setTimeout(() => { relaunch().catch((e) => setP({ k: "error", ...friendly(e) })); }, 1500);
    return () => clearTimeout(t);
  }, [p.k]);

  const checkNow = async () => {
    setP({ k: "checking" });
    try {
      const u = await check();
      setP(u ? { k: "available", update: u } : { k: "latest" });
    } catch (e) {
      setP({ k: "error", ...friendly(e) });
    }
  };

  const install = async (update: Update) => {
    let done = 0;
    let total: number | null = null;
    setP({ k: "downloading", update, done, total });
    try {
      await update.downloadAndInstall((ev) => {
        if (ev.event === "Started") total = ev.data.contentLength ?? null;
        else if (ev.event === "Progress") done += ev.data.chunkLength;
        setP({ k: "downloading", update, done, total });
      });
      setP({ k: "installed" });
    } catch (e) {
      setP({ k: "error", ...friendly(e) });
    }
  };

  const later = (u: Update) => {
    u.close().catch(() => {});
    setP({ k: "idle" });
  };

  const busy = p.k === "checking" || p.k === "downloading" || p.k === "installed";
  const box = "mt-2 rounded border p-2.5 text-sm";

  return (
    <div className="mt-3 border-t border-slate-200 pt-3">
      <div className="flex items-center justify-between gap-2">
        {/* 設定パネルが最小幅（300px）でも折り返さないよう、縮めるのはアプリ名だけにする */}
        <span className="flex min-w-0 items-baseline gap-1 whitespace-nowrap text-xs text-slate-600">
          <span className="truncate" title="seat-shuffler">seat-shuffler</span>
          {ver && <span className="shrink-0">v{ver}</span>}
          <button className="ml-1 shrink-0 text-slate-700 underline hover:text-slate-900" onClick={() => setShowNotes(true)}>
            更新内容
          </button>
        </span>
        <button className={`${secondary} shrink-0 whitespace-nowrap px-2! py-1! text-xs!`} disabled={busy || p.k === "available"} onClick={checkNow}>
          <RefreshCw className={`size-3.5 ${p.k === "checking" ? "animate-spin" : ""}`} />
          {p.k === "checking" ? "確認中…" : "更新を確認"}
        </button>
      </div>

      <div role="status" aria-live="polite">
        {p.k === "latest" && (
          <p className={`flex items-center gap-1.5 pt-2 text-xs text-slate-600 transition-opacity duration-500 ${fade ? "opacity-0" : "opacity-100"}`}>
            <CheckCircle2 className="size-3.5" />
            お使いのバージョン{ver && `（v${ver}）`}は最新です
          </p>
        )}

        {p.k === "available" && (
          <div className={`${box} border-slate-400 bg-slate-50 text-slate-900`}>
            <p className="font-bold">v{p.update.version} が利用可能です</p>
            <p className="text-xs text-slate-600">現在: v{p.update.currentVersion}</p>
            {p.update.body && (
              <pre className="mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap rounded-sm border border-slate-200 bg-white p-2 font-sans text-xs text-slate-800">{p.update.body}</pre>
            )}
            <p className="mt-2 text-xs text-slate-600">名簿・設定は自動保存されており、更新後もそのまま使えます。</p>
            <div className="mt-2 flex gap-2">
              <button className={primary} onClick={() => install(p.update)}><Download className="size-4" />今すぐアップデート</button>
              <button className={secondary} onClick={() => later(p.update)}>あとで</button>
            </div>
          </div>
        )}

        {p.k === "downloading" && (
          <div className={`${box} border-slate-400 bg-slate-50 text-slate-900`}>
            <p className="flex items-center gap-1.5"><Loader2 className="size-4 animate-spin" />v{p.update.version} をダウンロード中</p>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={p.total ? Math.round((p.done / p.total) * 100) : undefined}
              className="mt-2 h-2 overflow-hidden rounded-sm bg-slate-200"
            >
              <div className={`h-full bg-slate-800 transition-[width] ${p.total ? "" : "w-1/3 animate-pulse"}`} style={p.total ? { width: `${(p.done / p.total) * 100}%` } : undefined} />
            </div>
            <p className="mt-1 text-xs tabular-nums text-slate-600">
              {mb(p.done)} MB{p.total ? ` / ${mb(p.total)} MB（${Math.round((p.done / p.total) * 100)}%）` : ""}　終了までアプリを閉じないでください
            </p>
          </div>
        )}

        {p.k === "installed" && (
          <div className={`${box} border-slate-400 bg-slate-50 text-slate-900`}>
            <p className="flex items-center gap-1.5 font-bold"><RotateCw className="size-4 animate-spin" />アプリを再起動して更新を適用します</p>
            <button className={`${secondary} mt-2`} onClick={() => relaunch()}>今すぐ再起動</button>
          </div>
        )}

        {p.k === "error" && (
          <div className={`${box} border-rose-400 bg-rose-50 text-rose-900`}>
            <p className="flex items-start gap-1.5"><AlertCircle className="mt-0.5 size-4 shrink-0" />{p.msg}</p>
            <details className="mt-1 text-xs text-rose-800">
              <summary className="cursor-pointer">詳細</summary>
              <p className="mt-1 break-all">{p.detail}</p>
            </details>
            <button className={`${secondary} mt-2`} onClick={checkNow}>再試行</button>
          </div>
        )}
      </div>

      <ReleaseNotesDialog notes={showNotes ? RELEASE_NOTES : []} heading="更新内容" onClose={() => setShowNotes(false)} />
    </div>
  );
}
