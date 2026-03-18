import React, { useMemo } from 'react';

const styles = {
  select: {
    width: '100%',
    padding: '10px 12px',
    fontSize: 15,
    border: '1px solid #ccc',
    borderRadius: 6,
    marginBottom: 16,
    outline: 'none',
  },
  empty: {
    color: '#999',
    fontSize: 14,
  },
};

export default function GroupList({ groups, selected, onSelect }) {
  if (groups.length === 0) {
    return <p style={styles.empty}>Conecta WhatsApp para ver los grupos</p>;
  }

  // Group by community
  const { communities, standalone } = useMemo(() => {
    const comms = {}; // communityName -> [groups]
    const alone = [];

    for (const g of groups) {
      if (g.isCommunity) continue; // skip community parent entries
      if (g.communityName) {
        if (!comms[g.communityName]) comms[g.communityName] = [];
        comms[g.communityName].push(g);
      } else {
        alone.push(g);
      }
    }

    // Sort groups within each community
    for (const key of Object.keys(comms)) {
      comms[key].sort((a, b) => a.name.localeCompare(b.name));
    }
    alone.sort((a, b) => a.name.localeCompare(b.name));

    return { communities: comms, standalone: alone };
  }, [groups]);

  const communityNames = Object.keys(communities).sort();

  return (
    <select
      style={styles.select}
      value={selected?.id || ''}
      onChange={(e) => {
        const group = groups.find((g) => g.id === e.target.value);
        onSelect(group || null);
      }}
    >
      <option value="">Seleccionar grupo...</option>

      {communityNames.map((commName) => (
        <optgroup key={commName} label={`📁 ${commName}`}>
          {communities[commName].map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} ({g.participants})
            </option>
          ))}
        </optgroup>
      ))}

      {standalone.length > 0 && communityNames.length > 0 && (
        <optgroup label="Otros grupos">
          {standalone.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} ({g.participants})
            </option>
          ))}
        </optgroup>
      )}

      {standalone.length > 0 && communityNames.length === 0 && (
        standalone.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name} ({g.participants})
          </option>
        ))
      )}
    </select>
  );
}
