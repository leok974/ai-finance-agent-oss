import React, { useEffect, useState } from 'react';
import Card from './Card';
import { getRules, addRule, clearRules } from '../lib/api';

interface Rule {
  pattern: string;
  target: 'merchant' | 'description';
  category: string;
}

interface Props {
  refreshKey?: number;
}

const RulesPanel: React.FC<Props> = ({ refreshKey = 0 }) => {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(false);

  const loadRules = async () => {
    setLoading(true);
    try {
      const fetchedRules = await getRules();
      setRules(fetchedRules);
    } catch (error) {
      console.error("Failed to fetch rules:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, [refreshKey]);

  const handleClearRules = async () => {
    await clearRules();
    await loadRules();
  };

  return (
    <Card title="Rules" right={<button onClick={handleClearRules} className="px-2 py-1 rounded bg-red-700 text-white">Clear Rules</button>}>
      {loading ? (
        <div className="opacity-70">Loading…</div>
      ) : (
        <ul className="space-y-2">
          {rules.map((rule, index) => (
            <li key={index} className="rounded-lg border border-neutral-800 p-3 bg-neutral-900">
              <div className="font-mono text-sm">
                <span className="text-orange-400">IF</span> {rule.target} <span className="text-orange-400">CONTAINS</span> "{rule.pattern}"
              </div>
              <div className="font-mono text-sm">
                <span className="text-orange-400">THEN</span> CATEGORY = "{rule.category}"
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

export default RulesPanel;
