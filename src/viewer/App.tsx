import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import type { CSSProperties, ChangeEvent } from 'react';
import { buildSnapshots, type GameLog, type ViewerSnapshot } from './viewer-state.js';
import { TableLayout } from './components/TableLayout.js';
import { CenterInfo } from './components/CenterInfo.js';

function kyokuLabel(ev: GameLog['kyoku'][number]): string {
  const init = ev.events.find(e => e.kind === 'init');
  if (!init || init.kind !== 'init') return `局${ev.kyokuIndex + 1}`;
  const w = init.round.wind === 'E' ? '東' : '南';
  return `${w}${init.round.kyoku}局`;
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

export default function App() {
  const [log, setLog] = useState<GameLog | null>(null);
  const [kyokuIdx, setKyokuIdx] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const [povSeat, setPovSeat] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const kyokuStartScores = useMemo<[number, number, number, number][]>(
    () => (log ? computeKyokuStartScores(log) : []),
    [log],
  );

  const snapshots = useMemo<ViewerSnapshot[]>(() => {
    if (!log) return [];
    const kyoku = log.kyoku[kyokuIdx];
    if (!kyoku) return [];
    const start = kyokuStartScores[kyokuIdx] ?? [25000, 25000, 25000, 25000];
    return buildSnapshots(kyoku.events, start);
  }, [log, kyokuIdx, kyokuStartScores]);

  const total = snapshots.length;
  const snap = snapshots[stepIdx] ?? null;

  const clampStep = useCallback((n: number) => {
    setStepIdx(Math.max(0, Math.min(n, total - 1)));
  }, [total]);

  useEffect(() => { setStepIdx(0); }, [kyokuIdx]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') clampStep(stepIdx + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') clampStep(stepIdx - 1);
      else if (e.key === 'Home') setStepIdx(0);
      else if (e.key === 'End') setStepIdx(total - 1);
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
        setLog(parsed);
        setKyokuIdx(0);
        setStepIdx(0);
      } catch {
        alert('JSON パースエラー');
      }
    };
    reader.readAsText(file);
  }

  const headerStyle: CSSProperties = {
    background: '#1a472a',
    color: '#fff',
    padding: '8px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
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
    borderRadius: '4px 4px 0 0',
    border: '1px solid #ccc',
    borderBottom: active ? '1px solid #fff' : '1px solid #ccc',
    background: active ? '#fff' : '#e8e8e8',
    cursor: 'pointer',
    fontSize: 11,
  });

  const seatAt = {
    bottom: povSeat,
    right: (povSeat + 1) % 4,
    top: (povSeat + 2) % 4,
    left: (povSeat + 3) % 4,
  };

  return (
    <div style={{ fontFamily: 'monospace', background: '#2d2d2d', minHeight: '100vh' }}>
      {/* Header */}
      <div style={headerStyle}>
        <strong style={{ fontSize: 14 }}>LLM Mahjong Viewer</strong>
        <button style={{ ...btnStyle(), background: '#4a9' }} onClick={() => fileInputRef.current?.click()}>
          ログ読み込み
        </button>
        <input ref={fileInputRef} type="file" accept=".json" onChange={handleFile} style={{ display: 'none' }} />
        {log && (
          <>
            <span style={{ fontSize: 11, opacity: 0.7 }}>seed: {log.rngSeed}</span>
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
          </>
        )}
      </div>

      {!log ? (
        <div style={{ textAlign: 'center', marginTop: 80, color: '#888' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🀄</div>
          <div style={{ color: '#aaa' }}>ログファイル (.json) を読み込んでください</div>
          <div style={{ fontSize: 12, marginTop: 4, color: '#666' }}>pnpm match --log-file game.json で生成</div>
        </div>
      ) : (
        <div style={{ maxWidth: 800, margin: '0 auto', padding: 12 }}>
          {/* 局タブ */}
          <div style={{ display: 'flex', gap: 2, marginBottom: -1, flexWrap: 'wrap' }}>
            {log.kyoku.map((k, i) => (
              <button key={i} style={tabStyle(i === kyokuIdx)} onClick={() => setKyokuIdx(i)}>
                {kyokuLabel(k)}
              </button>
            ))}
          </div>

          {/* コントロールバー */}
          <div style={{ background: '#fff', border: '1px solid #ccc', borderRadius: '0 4px 4px 4px', padding: '6px 10px', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <button style={btnStyle(stepIdx === 0)} disabled={stepIdx === 0} onClick={() => setStepIdx(0)}>⏮</button>
              <button style={btnStyle(stepIdx === 0)} disabled={stepIdx === 0} onClick={() => clampStep(stepIdx - 1)}>◀</button>
              <button style={btnStyle(stepIdx >= total - 1)} disabled={stepIdx >= total - 1} onClick={() => clampStep(stepIdx + 1)}>▶</button>
              <button style={btnStyle(stepIdx >= total - 1)} disabled={stepIdx >= total - 1} onClick={() => setStepIdx(total - 1)}>⏭</button>
              <span style={{ fontSize: 11, color: '#666' }}>{stepIdx + 1}/{total}</span>
              <input
                type="range" min={0} max={total - 1} value={stepIdx}
                onChange={e => setStepIdx(Number(e.target.value))}
                style={{ flex: 1, minWidth: 80, maxWidth: 260 }}
              />
              <span style={{ fontSize: 10, color: '#999' }}>← →</span>
            </div>
            {snap && (
              <div style={{
                marginTop: 4, fontSize: 12, paddingLeft: 8,
                ...(snap.event.kind === 'think'
                  ? { color: '#555', borderLeft: '3px solid #a8a', background: '#f9f0ff', borderRadius: '0 4px 4px 0', padding: '4px 8px', whiteSpace: 'pre-wrap', maxHeight: 80, overflow: 'auto' }
                  : { color: '#333', borderLeft: '3px solid #4a9' }
                )
              }}>
                {snap.description}
              </div>
            )}
            {snap?.prompt && (
              <details style={{ marginTop: 4 }}>
                <summary style={{ fontSize: 11, color: '#888', cursor: 'pointer', userSelect: 'none' }}>
                  入力プロンプト表示
                </summary>
                <pre style={{
                  margin: '4px 0 0', fontSize: 10, background: '#f5f5f5', border: '1px solid #ddd',
                  borderRadius: 4, padding: '6px 8px', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  maxHeight: 300, overflow: 'auto', color: '#333',
                }}>
                  {snap.prompt}
                </pre>
              </details>
            )}
          </div>

          {/* 麻雀卓 */}
          {snap && (
            <TableLayout
              players={snap.players}
              seatAt={seatAt}
              povSeat={povSeat}
              showAll={showAll}
              remainingDraws={snap.wallRemaining}
              center={<CenterInfo snap={snap} seatAt={seatAt} />}
            />
          )}

          {/* 最終結果 */}
          <div style={{ background: '#fff', border: '1px solid #ccc', borderRadius: 6, padding: '6px 10px', marginTop: 10 }}>
            <strong style={{ fontSize: 12 }}>最終結果</strong>
            <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
              {log.standings.map(s => (
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
        </div>
      )}
    </div>
  );
}
