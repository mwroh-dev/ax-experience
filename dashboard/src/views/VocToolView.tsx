import { useState, useEffect } from 'react';
import { api } from '../lib/apiClient';
import type { ClassifyResult } from '../shared/types';

interface Scenario {
  scenario: string;
  expected_intent: string;
  expected_path: string;
}

interface GenerateResult {
  scenario: string;
  text: string;
  sample_email?: string;
  sample_order_id?: string;
  expected_intent: string;
  expected_path: string;
  requires_commerce_api: boolean;
  classified: ClassifyResult;
}

const RISK_CLASS: Record<string, string> = {
  low: 'badge-success',
  medium: 'badge-warn',
  high: 'badge-error',
};

export default function VocToolView() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [text, setText] = useState('');
  const [selectedScenario, setSelectedScenario] = useState('');
  const [classifyResult, setClassifyResult] = useState<ClassifyResult | null>(null);
  const [generateResult, setGenerateResult] = useState<GenerateResult | null>(null);
  const [classifying, setClassifying] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [classifyError, setClassifyError] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  useEffect(() => {
    api.voc.scenarios()
      .then(d => setScenarios((d.scenarios ?? []) as Scenario[]))
      .catch(() => {});
  }, []);

  const handleClassify = async () => {
    if (!text.trim()) return;
    setClassifying(true);
    setClassifyError(null);
    setClassifyResult(null);
    try {
      const result = await api.voc.classify(text);
      setClassifyResult(result);
    } catch (e: any) {
      setClassifyError(e.message);
    } finally {
      setClassifying(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedScenario) return;
    setGenerating(true);
    setGenerateError(null);
    setGenerateResult(null);
    try {
      const data = await api.voc.generate(selectedScenario) as GenerateResult;
      setGenerateResult(data);
      setText(data.text);
    } catch (e: any) {
      setGenerateError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      <div className="view-header">
        <h2 className="view-title">VOC Tool</h2>
      </div>

      {/* Generator */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 13 }}>Generate VOC Sample</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select
            value={selectedScenario}
            onChange={e => setSelectedScenario(e.target.value)}
            style={{
              flex: 1, padding: '6px 10px',
              background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', color: 'var(--text)', fontSize: 13,
            }}
          >
            <option value="">Select scenario…</option>
            {scenarios.map(s => (
              <option key={s.scenario} value={s.scenario}>
                {s.scenario} — {s.expected_intent}
              </option>
            ))}
          </select>
          <button
            className="refresh-btn"
            onClick={handleGenerate}
            disabled={!selectedScenario || generating}
          >
            {generating ? 'Generating…' : 'Generate'}
          </button>
        </div>
        {generateError && <div className="error-msg" style={{ marginTop: 8 }}>Error: {generateError}</div>}
        {generateResult && (
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {generateResult.sample_email && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Email: <span className="mono">{generateResult.sample_email}</span>
              </div>
            )}
            {generateResult.sample_order_id && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Order: <span className="mono">{generateResult.sample_order_id}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Classifier */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 13 }}>Classify Text</div>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Paste or generate customer message…"
          rows={5}
          style={{
            width: '100%', padding: '8px 12px',
            background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', color: 'var(--text)',
            fontSize: 13, resize: 'vertical', fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className="refresh-btn"
            onClick={handleClassify}
            disabled={!text.trim() || classifying}
          >
            {classifying ? 'Classifying…' : 'Classify'}
          </button>
        </div>
        {classifyError && <div className="error-msg">Error: {classifyError}</div>}
      </div>

      {/* Result */}
      {classifyResult && (
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 13 }}>Classification Result</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            <ResultField label="Intent" value={classifyResult.intent} mono />
            <ResultField label="Risk">
              <span className={`badge ${RISK_CLASS[classifyResult.risk_level] ?? 'badge-neutral'}`}>
                {classifyResult.risk_level}
              </span>
            </ResultField>
            <ResultField label="Recommended Path" value={classifyResult.recommended_path} mono />
            <ResultField label="Commerce API">
              <span className={`badge ${classifyResult.requires_commerce_api ? 'badge-warn' : 'badge-neutral'}`}>
                {classifyResult.requires_commerce_api ? 'required' : 'not needed'}
              </span>
            </ResultField>
            <ResultField label="Human Review">
              <span className={`badge ${classifyResult.requires_human_review ? 'badge-error' : 'badge-success'}`}>
                {classifyResult.requires_human_review ? 'required' : 'auto'}
              </span>
            </ResultField>
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            {classifyResult.reason}
          </div>
        </div>
      )}

      {/* Scenario reference */}
      {scenarios.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 13 }}>
            Available Scenarios ({scenarios.length})
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th>Expected Intent</th>
                  <th>Expected Path</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map(s => (
                  <tr
                    key={s.scenario}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedScenario(s.scenario)}
                  >
                    <td className="mono" style={{ fontSize: 11 }}>{s.scenario}</td>
                    <td className="mono" style={{ fontSize: 11 }}>{s.expected_intent}</td>
                    <td className="mono" style={{ fontSize: 11 }}>{s.expected_path}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultField({ label, value, mono, children }: {
  label: string; value?: string; mono?: boolean; children?: React.ReactNode;
}) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      {children ?? (
        <span className={mono ? 'mono' : ''} style={{ fontSize: 13 }}>{value}</span>
      )}
    </div>
  );
}
