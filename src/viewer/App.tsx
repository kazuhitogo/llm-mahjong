import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import type { CSSProperties, ChangeEvent } from 'react';
import { buildSnapshots, emptySnapshot, type GameLog, type ViewerSnapshot } from './viewer-state.js';
import type { GameEvent } from '../types/state.js';
import type { KyokuLog } from '../log/log.js';
import type { FinalStanding } from '../score/standings.js';
import { TableLayout } from './components/TableLayout.js';
import { CenterInfo } from './components/CenterInfo.js';

const WIND_JP = ['東', '南', '西', '北'] as const;
const EMPTY_SNAP = emptySnapshot();
const ZERO_TOKEN_USAGE: [TokenUsage, TokenUsage, TokenUsage, TokenUsage] = [
  { in: 0, out: 0, calls: 0 }, { in: 0, out: 0, calls: 0 },
  { in: 0, out: 0, calls: 0 }, { in: 0, out: 0, calls: 0 },
];
function seatLabel(s: number): string { return `seat${s}(${WIND_JP[s] ?? s}家)`; }


function kyokuLabel(ev: GameLog['kyoku'][number]): string {
  const init = ev.events.find(e => e.kind === 'init');
  if (!init || init.kind !== 'init') return `局${ev.kyokuIndex + 1}`;
  const w = { E: '東', S: '南', W: '西', N: '北' }[init.round.wind] ?? init.round.wind;
  return `${w}${init.round.kyoku}局`;
}

type TokenUsage = { in: number; out: number; calls: number };
type TimeUsage = { totalMs: number; calls: number };

function computeTokenUsage(log: GameLog): [TokenUsage, TokenUsage, TokenUsage, TokenUsage] {
  const usage: [TokenUsage, TokenUsage, TokenUsage, TokenUsage] = [
    { in: 0, out: 0, calls: 0 }, { in: 0, out: 0, calls: 0 },
    { in: 0, out: 0, calls: 0 }, { in: 0, out: 0, calls: 0 },
  ];
  for (const kyoku of log.kyoku) {
    for (const ev of kyoku.events) {
      if (ev.kind !== 'think') continue;
      const u = usage[ev.seat];
      if (!u) continue;
      u.in += ev.inputTokens ?? 0;
      u.out += ev.outputTokens ?? 0;
      u.calls += 1;
    }
  }
  return usage;
}

function computeTimeUsage(log: GameLog): [TimeUsage, TimeUsage, TimeUsage, TimeUsage] {
  const usage: [TimeUsage, TimeUsage, TimeUsage, TimeUsage] = [
    { totalMs: 0, calls: 0 }, { totalMs: 0, calls: 0 },
    { totalMs: 0, calls: 0 }, { totalMs: 0, calls: 0 },
  ];
  for (const kyoku of log.kyoku) {
    for (const ev of kyoku.events) {
      if (ev.kind !== 'think' || ev.elapsedMs == null) continue;
      const u = usage[ev.seat];
      if (!u) continue;
      u.totalMs += ev.elapsedMs;
      u.calls += 1;
    }
  }
  return usage;
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function computeKyokuStartScores(log: GameLog): [number, number, number, number][] {
  const result: [number, number, number, number][] = [];
  let scores: [number, number, number, number] = [25000, 25000, 25000, 25000];
  for (const kyoku of log.kyoku) {
    result.push([...scores] as [number, number, number, number]);
    const snaps = buildSnapshots(kyoku.events, [...scores] as [number, number, number, number]);
    if (snaps.length > 0) {
      scores = snaps[snaps.length - 1]!.scores;
    }
  }
  return result;
}

type LiveStatus = 'idle' | 'connecting' | 'live' | 'done' | 'error';

interface LiveMsg {
  type: string;
  seed?: number;
  models?: [string, string, string, string];
  kyokuIndex?: number;
  events?: GameEvent[];
  standings?: FinalStanding[];
}

export default function App() {
  const [log, setLog] = useState<GameLog | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [kyokuIdx, setKyokuIdx] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const [povSeat, setPovSeat] = useState(0);
  const [showAll, setShowAll] = useState(true);

  // Live mode state
  const [livePort, setLivePort] = useState('7777');
  const [liveStatus, setLiveStatus] = useState<LiveStatus>('idle');
  const [liveLog, setLiveLog] = useState<GameLog | null>(null);
  const [liveFollow, setLiveFollow] = useState(true);
  const esRef = useRef<EventSource | null>(null);
  const atEndRef = useRef(true);

  const effectiveLog = liveLog ?? log;

  const kyokuStartScores = useMemo<[number, number, number, number][]>(
    () => (effectiveLog ? computeKyokuStartScores(effectiveLog) : []),
    [effectiveLog],
  );

  const tokenUsage = useMemo(
    () => effectiveLog ? computeTokenUsage(effectiveLog) : ZERO_TOKEN_USAGE,
    [effectiveLog],
  );
  const timeUsage = useMemo(() => (effectiveLog ? computeTimeUsage(effectiveLog) : null), [effectiveLog]);

  const snapshots = useMemo<ViewerSnapshot[]>(() => {
    if (!effectiveLog) return [];
    const kyoku = effectiveLog.kyoku[kyokuIdx];
    if (!kyoku) return [];
    const start = kyokuStartScores[kyokuIdx] ?? [25000, 25000, 25000, 25000];
    return buildSnapshots(kyoku.events, start);
  }, [effectiveLog, kyokuIdx, kyokuStartScores]);

  const total = snapshots.length;
  const snap = snapshots[stepIdx] ?? null;
  const displaySnap = snap ?? EMPTY_SNAP;

  const clampStep = useCallback((n: number) => {
    setStepIdx(Math.max(0, Math.min(n, total - 1)));
  }, [total]);

  // Track whether user is at the end
  useEffect(() => {
    atEndRef.current = total === 0 || stepIdx >= total - 1;
  }, [stepIdx, total]);

  // Live auto-follow: when new events arrive (total increases), stay at end if following
  useEffect(() => {
    if (liveStatus === 'live' && liveFollow && total > 0) {
      setStepIdx(total - 1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, liveStatus]);

  // Auto-switch kyoku when new kyoku starts in live mode
  const liveKyokuLen = liveLog?.kyoku.length;
  useEffect(() => {
    if (liveStatus === 'live' && liveLog && liveLog.kyoku.length > 0) {
      setKyokuIdx(liveLog.kyoku.length - 1);
      setLiveFollow(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKyokuLen, liveStatus]);

  useEffect(() => { setStepIdx(0); }, [kyokuIdx]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { setLiveFollow(false); clampStep(stepIdx + 1); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { setLiveFollow(false); clampStep(stepIdx - 1); }
      else if (e.key === 'Home') { setLiveFollow(false); setStepIdx(0); }
      else if (e.key === 'End') { setLiveFollow(true); setStepIdx(total - 1); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [stepIdx, clampStep, total]);

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as GameLog;
        disconnectLive();
        setLog(parsed);
        setLiveLog(null);
        setFileName(file.name);
        setKyokuIdx(0);
        setStepIdx(0);
      } catch {
        alert('JSON パースエラー');
      }
    };
    reader.readAsText(file);
  }

  function connectLive() {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    setLiveStatus('connecting');
    setLiveLog(null);
    setLog(null);
    setFileName(null);
    setLiveFollow(true);

    const url = `http://localhost:${livePort}/events`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => setLiveStatus('connecting');

    es.onmessage = (e: MessageEvent<string>) => {
      const msg = JSON.parse(e.data) as LiveMsg;
      if (msg.type === 'init') {
        setLiveLog({
          version: 1,
          rngSeed: msg.seed ?? 0,
          models: msg.models,
          kyoku: [],
          standings: [],
        });
        setLiveStatus('live');
        setKyokuIdx(0);
      } else if (msg.type === 'events' && msg.events && msg.kyokuIndex != null) {
        const ki = msg.kyokuIndex;
        const newEvs = msg.events;
        setLiveLog(prev => {
          if (!prev) return prev;
          const kyoku: KyokuLog[] = [...prev.kyoku];
          if (!kyoku[ki]) {
            kyoku[ki] = { kyokuIndex: ki, events: [] };
          }
          kyoku[ki] = { kyokuIndex: ki, events: [...kyoku[ki]!.events, ...newEvs] };
          return { ...prev, kyoku };
        });
      } else if (msg.type === 'end') {
        setLiveLog(prev => prev ? { ...prev, standings: msg.standings ?? [] } : prev);
        setLiveStatus('done');
      }
    };

    es.onerror = () => {
      if (liveStatus !== 'live' && liveStatus !== 'done') {
        setLiveStatus('error');
      }
      es.close();
      esRef.current = null;
    };
  }

  function disconnectLive() {
    esRef.current?.close();
    esRef.current = null;
    setLiveStatus('idle');
  }

  const panelStyle: CSSProperties = {
    background: '#fff',
    border: '1px solid #ccc',
    borderRadius: 6,
    padding: '8px 10px',
  };

  const btnStyle = (disabled?: boolean): CSSProperties => ({
    padding: '3px 8px',
    borderRadius: 4,
    border: '1px solid #888',
    background: disabled ? '#eee' : '#fff',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    fontSize: 12,
  });

  const tabStyle = (active: boolean): CSSProperties => ({
    padding: '3px 8px',
    borderRadius: 4,
    border: active ? '1px solid #4a9' : '1px solid #ccc',
    background: active ? '#4a9' : '#e8e8e8',
    color: active ? '#fff' : '#333',
    cursor: 'pointer',
    fontSize: 11,
  });

  const seatAt = {
    bottom: povSeat,
    right: (povSeat + 1) % 4,
    top: (povSeat + 2) % 4,
    left: (povSeat + 3) % 4,
  };

  const liveStatusColor: Record<LiveStatus, string> = {
    idle: '#888',
    connecting: '#fa0',
    live: '#0c0',
    done: '#46a',
    error: '#c00',
  };
  const liveStatusLabel: Record<LiveStatus, string> = {
    idle: '',
    connecting: '接続中…',
    live: '● LIVE',
    done: '終了',
    error: '接続失敗',
  };

  const leftColumn = (
    <div style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={panelStyle}>
        <strong style={{ fontSize: 14, color: '#1a472a' }}>LLM Mahjong Viewer</strong>
        <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ ...btnStyle(), background: '#4a9', color: '#fff', display: 'inline-block' }}>
            ログ読み込み
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleFile}
              style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', border: 0 }}
            />
          </label>
        </div>
        {fileName && <div style={{ fontSize: 11, color: '#4a9', marginTop: 6, wordBreak: 'break-all' }}>{fileName}</div>}
        {effectiveLog && <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>seed: {effectiveLog.rngSeed}</div>}
        {effectiveLog?.models && (
          <div style={{ marginTop: 6 }}>
            {effectiveLog.models.map((m, i) => (
              <div key={i} style={{ fontSize: 10, color: '#555', lineHeight: 1.6 }}>
                seat{i}: {m}
              </div>
            ))}
          </div>
        )}

        {/* ライブ接続 */}
        <div style={{ marginTop: 10, borderTop: '1px solid #eee', paddingTop: 8 }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input
              type="text"
              value={livePort}
              onChange={e => setLivePort(e.target.value)}
              placeholder="7777"
              style={{ width: 52, fontSize: 11, padding: '2px 4px', border: '1px solid #ccc', borderRadius: 3 }}
            />
            {liveStatus === 'idle' || liveStatus === 'error' || liveStatus === 'done' ? (
              <button style={{ ...btnStyle(), background: '#146', color: '#fff' }} onClick={connectLive}>
                ライブ接続
              </button>
            ) : (
              <button style={{ ...btnStyle(), background: '#a33', color: '#fff' }} onClick={disconnectLive}>
                切断
              </button>
            )}
            {liveStatus !== 'idle' && (
              <span style={{ fontSize: 11, fontWeight: 'bold', color: liveStatusColor[liveStatus] }}>
                {liveStatusLabel[liveStatus]}
              </span>
            )}
          </div>
          {liveStatus === 'live' && (
            <label style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, color: '#555' }}>
              <input type="checkbox" checked={liveFollow} onChange={e => setLiveFollow(e.target.checked)} />
              最新イベントへ追従
            </label>
          )}
          {liveStatus === 'error' && (
            <div style={{ fontSize: 10, color: '#c00', marginTop: 3 }}>
              port {livePort} に接続できません。<br />--live で match を起動してください。
            </div>
          )}
        </div>
      </div>

      {/* 局タブ */}
      <div style={{ ...panelStyle, display: 'flex', gap: 4, flexWrap: 'wrap', minHeight: 34 }}>
        {effectiveLog?.kyoku.map((k, i) => (
          <button key={i} style={tabStyle(i === kyokuIdx)} onClick={() => { setKyokuIdx(i); setLiveFollow(false); }}>
            {kyokuLabel(k)}
          </button>
        ))}
      </div>

      {/* 再生コントローラー */}
      <div style={panelStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <button style={btnStyle(total === 0 || stepIdx === 0)} disabled={total === 0 || stepIdx === 0} onClick={() => { setLiveFollow(false); setStepIdx(0); }}>⏮</button>
          <button style={btnStyle(total === 0 || stepIdx === 0)} disabled={total === 0 || stepIdx === 0} onClick={() => { setLiveFollow(false); clampStep(stepIdx - 1); }}>◀</button>
          <button style={btnStyle(total === 0 || stepIdx >= total - 1)} disabled={total === 0 || stepIdx >= total - 1} onClick={() => { setLiveFollow(false); clampStep(stepIdx + 1); }}>▶</button>
          <button style={btnStyle(total === 0 || stepIdx >= total - 1)} disabled={total === 0 || stepIdx >= total - 1} onClick={() => { setLiveFollow(true); setStepIdx(total - 1); }}>⏭</button>
          <span style={{ fontSize: 11, color: '#666' }}>{total > 0 ? `${stepIdx + 1}/${total}` : '–'}</span>
        </div>
        <input
          type="range" min={0} max={Math.max(0, total - 1)} value={stepIdx}
          onChange={e => { setLiveFollow(false); setStepIdx(Number(e.target.value)); }}
          style={{ width: '100%', marginTop: 6 }}
          disabled={total === 0}
        />
        <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>← → / ↑ ↓ / Home End</div>
      </div>

      {/* POV / 全開示 */}
      <div style={{ ...panelStyle, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
          POV:
          <select
            value={povSeat}
            onChange={e => setPovSeat(Number(e.target.value))}
            style={{ fontSize: 11, padding: '1px 4px' }}
          >
            {[0, 1, 2, 3].map(s => (
              <option key={s} value={s}>seat{s}</option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="checkbox"
            checked={showAll}
            onChange={e => setShowAll(e.target.checked)}
          />
          全開示
        </label>
      </div>

      {/* トークン使用量（全局通算） */}
      <div style={panelStyle}>
        <strong style={{ fontSize: 12 }}>トークン使用量（全局通算）</strong>
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {tokenUsage.map((u, i) => (
            <div key={i} style={{ fontSize: 10, color: '#444', lineHeight: 1.5 }}>
              <span style={{ fontWeight: 'bold' }}>{seatLabel(i)}</span>
              <span style={{ marginLeft: 4, color: '#06c' }}>IN {u.in.toLocaleString()}</span>
              <span style={{ marginLeft: 4, color: '#c60' }}>OUT {u.out.toLocaleString()}</span>
              <span style={{ marginLeft: 4, color: '#999' }}>({u.calls}回)</span>
            </div>
          ))}
          <div style={{ fontSize: 10, color: '#666', borderTop: '1px solid #eee', marginTop: 3, paddingTop: 3 }}>
            合計 IN {tokenUsage.reduce((s, u) => s + u.in, 0).toLocaleString()}
            {' / '}OUT {tokenUsage.reduce((s, u) => s + u.out, 0).toLocaleString()}
          </div>
        </div>
      </div>

      {/* 思考時間（全局通算） */}
      {timeUsage && timeUsage.some(u => u.calls > 0) && (
        <div style={panelStyle}>
          <strong style={{ fontSize: 12 }}>思考時間（全局通算）</strong>
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {timeUsage.map((u, i) => (
              <div key={i} style={{ fontSize: 10, color: '#444', lineHeight: 1.5 }}>
                <span style={{ fontWeight: 'bold' }}>{seatLabel(i)}</span>
                <span style={{ marginLeft: 4, color: '#080' }}>合計 {fmtMs(u.totalMs)}</span>
                <span style={{ marginLeft: 4, color: '#999' }}>({u.calls}回)</span>
                {u.calls > 0 && (
                  <span style={{ marginLeft: 4, color: '#666' }}>avg {fmtMs(Math.round(u.totalMs / u.calls))}</span>
                )}
              </div>
            ))}
            <div style={{ fontSize: 10, color: '#666', borderTop: '1px solid #eee', marginTop: 3, paddingTop: 3 }}>
              合計 {fmtMs(timeUsage.reduce((s, u) => s + u.totalMs, 0))}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const rightColumn = (
    <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {displaySnap.description && (
        displaySnap.thinkEvent ? (
          <div style={{ ...panelStyle, borderLeft: '4px solid #a8a', background: '#f9f0ff' }}>
            <div style={{
              fontSize: 12, fontWeight: 'bold', color: '#1a4a1a', background: '#e6f4ea',
              border: '1px solid #9c9', borderRadius: 4, padding: '4px 8px', marginBottom: 8,
            }}>
              {displaySnap.description}
            </div>
            <div style={{ fontSize: 12, color: '#555', whiteSpace: 'pre-wrap' }}>{displaySnap.thinkEvent.reasoning}</div>
          </div>
        ) : (
          <div style={{ ...panelStyle, fontSize: 12, color: '#333', borderLeft: '4px solid #4a9' }}>
            {displaySnap.description}
          </div>
        )
      )}
      {displaySnap.thinkEvent?.prompt && (
        <div style={panelStyle}>
          <details open>
            <summary style={{ fontSize: 11, color: '#888', cursor: 'pointer', userSelect: 'none' }}>
              入力プロンプト表示
            </summary>
            <pre style={{
              margin: '4px 0 0', fontSize: 10, background: '#f5f5f5', border: '1px solid #ddd',
              borderRadius: 4, padding: '6px 8px', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              maxHeight: 480, overflow: 'auto', color: '#333',
            }}>
              {displaySnap.thinkEvent.prompt}
            </pre>
          </details>
        </div>
      )}
    </div>
  );

  const centerColumn = (
    <div style={{ flexShrink: 0 }}>
      <TableLayout
        players={displaySnap.players}
        seatAt={seatAt}
        povSeat={povSeat}
        showAll={showAll}
        wall={displaySnap.wall}
        center={<CenterInfo snap={displaySnap} seatAt={seatAt} hideLabels={!effectiveLog} />}
      />
      {effectiveLog && (
        <div style={{ ...panelStyle, marginTop: 10 }}>
          <strong style={{ fontSize: 12 }}>最終結果</strong>
          <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
            {effectiveLog.standings.map(s => (
              <div key={s.seat} style={{ fontSize: 11, padding: '3px 8px', background: s.rank === 1 ? '#fffbe0' : '#f5f5f5', borderRadius: 4, border: '1px solid #ddd' }}>
                <span style={{ fontWeight: 'bold' }}>{s.rank}位</span> seat{s.seat}
                <span style={{ marginLeft: 4, color: '#555' }}>{s.rawScore}点</span>
                <span style={{ marginLeft: 3, color: s.finalScore >= 0 ? '#060' : '#c00', fontWeight: 'bold' }}>
                  {s.finalScore > 0 ? '+' : ''}{s.finalScore}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ fontFamily: 'monospace', background: '#2d2d2d', minHeight: '100vh', padding: 12, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'center', flexWrap: 'wrap' }}>
        {leftColumn}
        {centerColumn}
        {rightColumn}
      </div>
    </div>
  );
}
